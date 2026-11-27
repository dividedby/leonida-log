import { gunzipSync } from "node:zlib";
import { Robots } from "./robots";

/** Never imitate a browser, and keep clear of tokens IGN blocks (Claude, Code, Cursor). */
export const USER_AGENT =
  "LeonidaLogBot/0.1 (+https://github.com/dividedby/leonida-log)";
export const ROBOTS_TOKEN = "leonidalogbot";

const DEFAULT_INTERVAL_MS = 5000;
const MAX_CRAWL_DELAY_MS = 60_000;
const MAX_RETRY_AFTER_MS = 120_000;
const TIMEOUT_MS = 30_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_GUNZIP_BYTES = 64 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_CONSECUTIVE_5XX = 3;

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
  sleep?: (ms: number) => Promise<void>;
  defaultIntervalMs?: number;
  timeoutMs?: number;
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
  /** Consecutive 5xx responses this run; any other response resets it. */
  serverErrors: number;
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

function retryAfterMs(headers: Headers, now: number): number {
  const value = headers.get("retry-after");
  if (!value) return 5000;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - now;
  return Math.min(
    Math.max(Number.isFinite(ms) ? ms : 5000, 0),
    MAX_RETRY_AFTER_MS,
  );
}

async function readBody(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    throw new Error(`body over ${maxBytes} bytes`);
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
      throw new Error(`body over ${maxBytes} bytes`);
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
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const defaultInterval = deps.defaultIntervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const log = deps.log ?? (() => {});
  const hosts = new Map<string, HostState>();

  function hostState(host: string): HostState {
    let s = hosts.get(host);
    if (!s) {
      s = {
        lastAt: Number.NEGATIVE_INFINITY,
        tail: Promise.resolve(),
        serverErrors: 0,
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
        const res = await fetchImpl(url.href, {
          headers: { "user-agent": USER_AGENT, ...headers },
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
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

  function loadRobots(url: URL, intervalMs: number): Promise<Robots> {
    const state = hostState(url.host);
    state.robots ??= (async () => {
      let target = new URL("/robots.txt", url);
      try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
          const { res, bytes } = await request(
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
          if (res.status >= 500) {
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

      let retried = false;
      for (let hop = 0; hop <= MAX_REDIRECTS;) {
        const state = hostState(url.host);
        if (state.stopped) {
          return empty("host-stopped", state.stopped.status, {
            finalUrl: url.href,
            error: state.stopped.reason,
          });
        }
        const robots = await loadRobots(url, baseInterval);
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
          stats.requests++;
          ({ res, bytes } = await request(url, headers, interval, maxBytes));
        } catch (error) {
          stats.errors++;
          return empty("error", 0, {
            finalUrl: url.href,
            error: error instanceof Error ? error.message : String(error),
          });
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

        // A first 429/503 gets its Retry-After retry before it counts as a streak 5xx.
        const retryable =
          (res.status === 429 || res.status === 503) && !retried;
        if (!retryable) {
          state.serverErrors = res.status >= 500 ? state.serverErrors + 1 : 0;
        }

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
        if (
          !retryable &&
          res.status >= 500 &&
          state.serverErrors >= MAX_CONSECUTIVE_5XX
        ) {
          stop(
            state,
            url.host,
            `${state.serverErrors} consecutive 5xx (last ${res.status})`,
            res.status,
            stats,
          );
          return result("http-error", String(res.status));
        }
        if (res.status === 429 || res.status === 503) {
          if (!retried) {
            retried = true;
            const wait = retryAfterMs(res.headers, now());
            log(
              `${res.status} from ${url.host}: retrying once after ${wait} ms`,
            );
            await sleep(wait);
            continue;
          }
          stop(state, url.host, String(res.status), res.status, stats);
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
