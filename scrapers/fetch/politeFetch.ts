import { gunzipSync } from "node:zlib";
import { Robots } from "./robots";

/** Never imitate a browser, and keep clear of tokens IGN blocks (Claude, Code, Cursor). */
export const USER_AGENT =
  "LeonidaLogBot/0.1 (+https://github.com/dividedby/leonida-log)";
export const ROBOTS_TOKEN = "leonidalogbot";

const DEFAULT_INTERVAL_MS = 5000;
const MAX_CRAWL_DELAY_MS = 60_000;
/** A Retry-After longer than this is not waited out: the request gives up instead. */
const MAX_RETRY_WAIT_MS = 60_000;
const TIMEOUT_MS = 30_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_GUNZIP_BYTES = 64 * 1024 * 1024;
const MAX_REDIRECTS = 5;
/** Consecutive failed URLs (5xx, timeout or network error, after retries) that stop a host. */
const MAX_CONSECUTIVE_FAILURES = 3;
/** Extra attempts after a timeout, network error, 429 or 5xx. */
const MAX_RETRIES = 2;
/** Wait before retry n (1-based) without a Retry-After: 10 s, then 20 s. */
const RETRY_BACKOFF_MS = 10_000;
/**
 * Retries across the whole run, all sources and hosts. Each costs at most its
 * wait plus one request (60 s + 30 s), so retries add at most 12 min to a run.
 * The first server run took ~23 min with none, under the scrape unit's 45 min
 * TimeoutStartSec.
 */
const RETRY_BUDGET_PER_RUN = 8;

export type FetchOutcome =
  | "ok"
  | "not-modified"
  | "blocked-robots"
  | "host-stopped"
  | "http-error"
  | "error";

export interface FetchResult {
  url: string;
  finalUrl: string;
  outcome: FetchOutcome;
  /** 0 when no response was received. */
  status: number;
  headers: Headers;
  bytes: Uint8Array;
  /** Body decoded by Content-Type charset (gunzipped first when needed). */
  text: string;
  error?: string;
}

export interface GetOptions {
  etag?: string;
  lastModified?: string;
  accept?: string;
  /** Extra request headers (an API version pin); they can't override the User-Agent. */
  headers?: Record<string, string>;
  /** Overrides the 5 MB body cap (large WP REST pages). */
  maxBytes?: number;
}

export type SourceFetch = (
  url: string,
  options?: GetOptions,
) => Promise<FetchResult>;

export interface FetchStats {
  requests: number;
  robotsBlocked: number;
  hostStopped: number;
  errors: number;
}

export interface PoliteFetchDeps {
  fetch?: typeof fetch;
  now?: () => number;
  /** Resolves after `ms`; rejects (and should stop its timer) when `signal` aborts. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  defaultIntervalMs?: number;
  timeoutMs?: number;
  /** Retries allowed across the run (default 8). */
  retryBudget?: number;
  /**
   * Hard limit on the whole fetcher's life, from its creation. At the deadline every in-flight request, body
   * read and wait (spacing, Retry-After, backoff, Crawl-delay) aborts and later requests fail at once with
   * outcome "error", so a caller's run ends by itself. Real timers: tests set it small.
   */
  deadlineMs?: number;
  log?: (message: string) => void;
}

export interface PoliteFetcher {
  /** A fetch that spaces requests per host by at least `minIntervalMs`. */
  forSource(minIntervalMs?: number): { get: SourceFetch; stats: FetchStats };
  /** Why requests to `host` stopped this run, if they did. */
  stoppedReason(host: string): string | undefined;
}

interface HostState {
  lastAt: number;
  tail: Promise<unknown>;
  stopped?: { reason: string; status: number };
  /** Consecutive URLs that failed after their retries; any other response resets it. */
  failures: number;
  robots?: Promise<Robots>;
}

/**
 * Gunzips bodies that start with the gzip magic bytes. That covers `.xml.gz`
 * sitemaps served as raw gzip; a Content-Encoding gzip body is already
 * inflated by fetch and has no magic left.
 */
export function maybeGunzip(bytes: Uint8Array): Uint8Array {
  const magic = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  return magic
    ? gunzipSync(bytes, { maxOutputLength: MAX_GUNZIP_BYTES })
    : bytes;
}

function charsetOf(headers: Headers, bytes: Uint8Array): string {
  const header = /charset\s*=\s*"?([^;"\s]+)/i.exec(
    headers.get("content-type") ?? "",
  );
  if (header) return header[1];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const meta =
    /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head) ??
    /<\?xml[^>]+encoding\s*=\s*["']([\w-]+)/i.exec(head);
  return meta ? meta[1] : "utf-8";
}

export function decodeBody(bytes: Uint8Array, headers: Headers): string {
  const plain = maybeGunzip(bytes);
  const label = charsetOf(headers, plain);
  try {
    return new TextDecoder(label).decode(plain);
  } catch {
    return new TextDecoder("utf-8").decode(plain);
  }
}

/** Retry-After in ms (seconds or an HTTP date); `fallback` when absent or unreadable. */
function retryAfterMs(headers: Headers, now: number, fallback: number): number {
  const value = headers.get("retry-after");
  if (!value) return fallback;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - now;
  return Math.max(Number.isFinite(ms) ? ms : fallback, 0);
}

/** The body cap was hit: the host answered, so this is never retried. */
class BodyTooLargeError extends Error {}

/** The fetcher's deadline passed: nothing more is requested or waited for. */
class DeadlineError extends Error {
  constructor() {
    super("run deadline exceeded");
  }
}

const retryableStatus = (status: number) => status === 429 || status >= 500;

async function readBody(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    throw new BodyTooLargeError(`body over ${maxBytes} bytes`);
  }
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError(`body over ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export function createPoliteFetcher(deps: PoliteFetchDeps = {}): PoliteFetcher {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const baseSleep =
    deps.sleep ??
    ((ms: number, signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true },
        );
      }));
  // AbortSignal.timeout timers don't keep the process alive.
  const deadline =
    deps.deadlineMs === undefined
      ? undefined
      : AbortSignal.timeout(deps.deadlineMs);
  const expired = () => deadline?.aborted === true;
  const deadlineHit = deadline
    ? new Promise<never>((_, reject) =>
        deadline.addEventListener("abort", () => reject(new DeadlineError()), {
          once: true,
        }),
      )
    : undefined;
  deadlineHit?.catch(() => {});
  /** A wait that ends early, by throwing DeadlineError, at the deadline. */
  const sleep = async (ms: number): Promise<void> => {
    if (!deadlineHit) return baseSleep(ms);
    if (expired()) throw new DeadlineError();
    await Promise.race([baseSleep(ms, deadline), deadlineHit]);
  };
  const defaultInterval = deps.defaultIntervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const log = deps.log ?? (() => {});
  const hosts = new Map<string, HostState>();
  let retriesLeft = deps.retryBudget ?? RETRY_BUDGET_PER_RUN;

  function hostState(host: string): HostState {
    let s = hosts.get(host);
    if (!s) {
      s = {
        lastAt: Number.NEGATIVE_INFINITY,
        tail: Promise.resolve(),
        failures: 0,
      };
      hosts.set(host, s);
    }
    return s;
  }

  /** One network request, serialized per host and spaced by `intervalMs`. */
  function request(
    url: URL,
    headers: Record<string, string>,
    intervalMs: number,
    maxBytes: number,
  ): Promise<{ res: Response; bytes: Uint8Array }> {
    const state = hostState(url.host);
    const run = async () => {
      const wait = state.lastAt + intervalMs - now();
      if (wait > 0) await sleep(wait);
      state.lastAt = now();
      try {
        const timeout = AbortSignal.timeout(timeoutMs);
        const res = await fetchImpl(url.href, {
          headers: { "user-agent": USER_AGENT, ...headers },
          redirect: "manual",
          signal: deadline ? AbortSignal.any([timeout, deadline]) : timeout,
        });
        if (res.status >= 300 && res.status < 400) {
          await res.body?.cancel();
          return { res, bytes: new Uint8Array() };
        }
        return { res, bytes: await readBody(res, maxBytes) };
      } finally {
        state.lastAt = now();
      }
    };
    const p = state.tail.then(run);
    state.tail = p.catch(() => {});
    return p;
  }

  /**
   * `request`, retried up to MAX_RETRIES times on a timeout, network error, 429
   * or 5xx. Each retry waits Retry-After or the backoff (a Retry-After over 60 s
   * ends the retries), and
   * `request` still keeps the host interval. Draws on the run's retry budget.
   * Returns the last response, or throws the last error; callers judge only
   * that final outcome.
   */
  async function requestWithRetry(
    url: URL,
    headers: Record<string, string>,
    intervalMs: number,
    maxBytes: number,
    onAttempt: () => void = () => {},
  ): Promise<{ res: Response; bytes: Uint8Array }> {
    for (let attempt = 0; ; attempt++) {
      const backoff = RETRY_BACKOFF_MS * 2 ** attempt;
      let wait: number;
      let why: string;
      try {
        onAttempt();
        const out = await request(url, headers, intervalMs, maxBytes);
        if (
          !retryableStatus(out.res.status) ||
          attempt >= MAX_RETRIES ||
          retriesLeft <= 0
        ) {
          return out;
        }
        wait = retryAfterMs(out.res.headers, now(), backoff);
        if (wait > MAX_RETRY_WAIT_MS) {
          log(
            `${out.res.status} from ${url.href}: Retry-After ${wait} ms is over ${MAX_RETRY_WAIT_MS} ms, not retrying`,
          );
          return out;
        }
        why = String(out.res.status);
      } catch (error) {
        if (expired()) throw new DeadlineError();
        if (
          error instanceof BodyTooLargeError ||
          attempt >= MAX_RETRIES ||
          retriesLeft <= 0
        ) {
          throw error;
        }
        wait = backoff;
        why = error instanceof Error ? error.message : String(error);
      }
      retriesLeft--;
      log(
        `${why} from ${url.href}: retry ${attempt + 1} of ${MAX_RETRIES} after ${wait} ms (${retriesLeft} left this run)`,
      );
      await sleep(wait);
    }
  }

  function loadRobots(url: URL, intervalMs: number): Promise<Robots> {
    const state = hostState(url.host);
    state.robots ??= (async () => {
      let target = new URL("/robots.txt", url);
      try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
          const { res, bytes } = await requestWithRetry(
            target,
            { accept: "text/plain,*/*;q=0.5" },
            intervalMs,
            MAX_BYTES,
          );
          const location = res.headers.get("location");
          if (res.status >= 300 && res.status < 400 && location) {
            target = new URL(location, target);
            continue;
          }
          if (res.status >= 200 && res.status < 300) {
            return Robots.parse(decodeBody(bytes, res.headers), ROBOTS_TOKEN);
          }
          if (res.status >= 500 || res.status === 429) {
            log(
              `robots.txt ${res.status} on ${url.host}: treating host as disallowed`,
            );
            return Robots.disallowAll();
          }
          return Robots.allowAll();
        }
        return Robots.allowAll();
      } catch (error) {
        log(
          `robots.txt unreachable on ${url.host} (${String(error)}): treating host as disallowed`,
        );
        return Robots.disallowAll();
      }
    })();
    return state.robots;
  }

  function stop(
    state: HostState,
    host: string,
    reason: string,
    status: number,
    stats: FetchStats,
  ) {
    if (state.stopped) return;
    state.stopped = { reason, status };
    stats.hostStopped++;
    log(`stopping ${host} for this run: ${reason}`);
  }

  function forSource(minIntervalMs?: number) {
    const stats: FetchStats = {
      requests: 0,
      robotsBlocked: 0,
      hostStopped: 0,
      errors: 0,
    };
    const baseInterval = minIntervalMs ?? defaultInterval;

    const get: SourceFetch = async (urlStr, options = {}) => {
      const empty = (
        outcome: FetchOutcome,
        status: number,
        extra: Partial<FetchResult> = {},
      ): FetchResult => ({
        url: urlStr,
        finalUrl: urlStr,
        outcome,
        status,
        headers: new Headers(),
        bytes: new Uint8Array(),
        text: "",
        ...extra,
      });

      let url: URL;
      try {
        url = new URL(urlStr);
      } catch {
        stats.errors++;
        return empty("error", 0, { error: "invalid URL" });
      }
      const maxBytes = options.maxBytes ?? MAX_BYTES;
      const headers: Record<string, string> = {
        accept:
          options.accept ??
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      };
      for (const [k, v] of Object.entries(options.headers ?? {})) {
        if (k.toLowerCase() !== "user-agent") headers[k.toLowerCase()] = v;
      }
      if (options.etag) headers["if-none-match"] = options.etag;
      if (options.lastModified) {
        headers["if-modified-since"] = options.lastModified;
      }

      for (let hop = 0; hop <= MAX_REDIRECTS;) {
        const state = hostState(url.host);
        if (state.stopped) {
          return empty("host-stopped", state.stopped.status, {
            finalUrl: url.href,
            error: state.stopped.reason,
          });
        }
        const robots = await loadRobots(url, baseInterval);
        if (expired()) {
          stats.errors++;
          return empty("error", 0, {
            finalUrl: url.href,
            error: "run deadline exceeded",
          });
        }
        if (!robots.isAllowed(url.pathname + url.search)) {
          stats.robotsBlocked++;
          log(`robots.txt disallows ${url.href}`);
          return empty("blocked-robots", 0, { finalUrl: url.href });
        }
        const interval = Math.max(
          baseInterval,
          Math.min((robots.crawlDelaySec ?? 0) * 1000, MAX_CRAWL_DELAY_MS),
        );

        let res: Response;
        let bytes: Uint8Array;
        try {
          ({ res, bytes } = await requestWithRetry(
            url,
            headers,
            interval,
            maxBytes,
            () => stats.requests++,
          ));
        } catch (error) {
          stats.errors++;
          const message =
            error instanceof Error ? error.message : String(error);
          if (error instanceof DeadlineError) {
            return empty("error", 0, { finalUrl: url.href, error: message });
          }
          if (!(error instanceof BodyTooLargeError)) {
            state.failures++;
            if (state.failures >= MAX_CONSECUTIVE_FAILURES) {
              stop(
                state,
                url.host,
                `${state.failures} consecutive failed requests (last: ${message})`,
                0,
                stats,
              );
            }
          }
          return empty("error", 0, { finalUrl: url.href, error: message });
        }

        const result = (outcome: FetchOutcome, error?: string): FetchResult => {
          let text = "";
          if (outcome === "ok") {
            try {
              text = decodeBody(bytes, res.headers);
            } catch (e) {
              stats.errors++;
              return empty("error", res.status, {
                finalUrl: url.href,
                error: `undecodable body: ${String(e)}`,
              });
            }
          }
          return {
            url: urlStr,
            finalUrl: url.href,
            outcome,
            status: res.status,
            headers: res.headers,
            bytes,
            text,
            error,
          };
        };

        // Only the final response after retries counts toward the failure streak.
        state.failures = res.status >= 500 ? state.failures + 1 : 0;

        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && res.status !== 304) {
          if (!location)
            return result("http-error", "redirect without Location");
          url = new URL(location, url);
          hop++;
          continue;
        }
        if (res.status === 304) return result("not-modified");
        if (res.status >= 200 && res.status < 300) return result("ok");
        if (res.status === 403) {
          stop(state, url.host, "403", 403, stats);
          return result("http-error", "403");
        }
        if (res.status === 429 || res.status === 503) {
          // Still throttled after every Retry-After: leave the host alone.
          stop(state, url.host, String(res.status), res.status, stats);
          return result("http-error", String(res.status));
        }
        if (res.status >= 500 && state.failures >= MAX_CONSECUTIVE_FAILURES) {
          stop(
            state,
            url.host,
            `${state.failures} consecutive failed requests (last: ${res.status})`,
            res.status,
            stats,
          );
          return result("http-error", String(res.status));
        }
        return result("http-error", String(res.status));
      }
      stats.errors++;
      return empty("error", 0, { error: "too many redirects" });
    };

    return { get, stats };
  }

  return {
    forSource,
    stoppedReason: (host) => hosts.get(host)?.stopped?.reason,
  };
}
