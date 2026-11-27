import type { FetchResult } from "../fetch/politeFetch";
import type {
  SourceModule,
  WatchCandidate,
  WatchContext,
  WatchItem,
  WatchResult,
} from "../types";
import { RAW_EXTRACT_MAX, sha256, toIso, truncate } from "../util";
import { loadGithubConfig, type GithubConfig } from "./githubConfig";

// GitHub REST API only. github.com and raw.githubusercontent.com disallow
// /raw/, /commits/ and /tree/ for `*` in robots.txt, so the `url` stored on a
// watched file is for display and is never fetched. Releases, archives and
// `download_url`s are never requested either.
const API = "https://api.github.com";
export const TIER_LINE =
  "Tier B — datamine: IDs real, labels community guesses";
export const SEARCH_URL = `${API}/search/repositories#gta6-datamines`;
const API_VERSION = "2022-11-28";
const JSON_ACCEPT = "application/vnd.github+json";
const RAW_ACCEPT = "application/vnd.github.raw+json";
/** Stop making calls when the unauthenticated hourly budget (60) falls below this. */
const RATE_RESERVE = 5;
const INLINE_LINES = 200;
const COMPARE_MAX_BYTES = 10 * 1024 * 1024;
const COMMIT_LIST_MAX = 20;
const SNIPPETS = 3;
const SNIPPET_CHARS = 160;
const FIRST_SEARCH_DAYS = 30;
const DAY_MS = 86_400_000;

interface Commit {
  sha: string;
  commit: { message: string; committer?: { date?: string } };
}
interface CompareFile {
  filename: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string;
}
interface Compare {
  commits: Commit[];
  files: CompareFile[];
}
interface Repo {
  full_name: string;
  name: string;
  html_url: string;
  description: string | null;
  topics?: string[];
  stargazers_count: number;
  pushed_at: string | null;
  license: { spdx_id?: string | null; name?: string } | null;
  default_branch: string;
  fork: boolean;
}

const firstLine = (message: string) => message.split("\n")[0].trim();
const commitDate = (c: Commit) => toIso(c.commit.committer?.date);

function parseJson<T>(res: FetchResult): T | null {
  try {
    return JSON.parse(res.text) as T;
  } catch {
    return null;
  }
}

/** Calls through the polite layer and tracks the rate budget from every response. */
class GithubClient {
  /** Why GitHub calls stopped this run; null while the budget holds. */
  stopped: string | null = null;
  calls = 0;

  private readonly ctx: WatchContext;

  constructor(ctx: WatchContext) {
    this.ctx = ctx;
  }

  /** Null when the run already stopped: the caller counts the work as deferred. */
  async get(
    path: string,
    options: { etag?: string; accept?: string; maxBytes?: number } = {},
  ): Promise<FetchResult | null> {
    if (this.stopped) return null;
    const res = await this.ctx.fetch(`${API}${path}`, {
      accept: options.accept ?? JSON_ACCEPT,
      etag: options.etag,
      maxBytes: options.maxBytes,
      headers: { "x-github-api-version": API_VERSION },
    });
    this.calls++;
    this.observe(res);
    return res;
  }

  private stop(reason: string) {
    if (this.stopped) return;
    this.stopped = reason;
    this.ctx.log(`[github] stopping GitHub calls this run: ${reason}`);
  }

  private observe(res: FetchResult) {
    if (res.outcome === "host-stopped" || res.outcome === "blocked-robots") {
      this.stop(res.error ?? res.outcome);
      return;
    }
    const header = res.headers.get("x-ratelimit-remaining");
    const remaining = header === null ? undefined : Number(header);
    if ((res.status === 403 || res.status === 429) && remaining === 0) {
      // Rate limiting, not a block: it clears at the reset time.
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const at =
        Number.isFinite(reset) && reset > 0
          ? new Date(reset * 1000).toISOString()
          : "unknown";
      this.stop(`rate limited until ${at} (UTC)`);
      return;
    }
    if (res.outcome === "http-error" && res.status === 403) {
      this.stop("403 from GitHub");
      return;
    }
    // Search has its own small limit; only the core budget is reserved.
    const isSearch = res.headers.get("x-ratelimit-resource") === "search";
    if (
      !isSearch &&
      remaining !== undefined &&
      Number.isFinite(remaining) &&
      remaining < RATE_RESERVE
    ) {
      this.stop(`rate budget low (${remaining} left, reserve ${RATE_RESERVE})`);
    }
  }
}

function header(repo: string, path: string, c: Commit): string[] {
  return [
    `Repo: ${repo}`,
    `Path: ${path}`,
    `Commit: ${c.sha}`,
    `Date: ${commitDate(c) ?? "unknown"}`,
    `Message: ${firstLine(c.commit.message)}`,
    TIER_LINE,
  ];
}

/** `+`/`-` rows of a unified patch; hunk headers, context lines and "no newline" markers dropped. */
function changedRows(patch: string): { added: string[]; rows: string[] } {
  const rows = patch
    .split("\n")
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && l.length > 0);
  return { rows, added: rows.filter((l) => l.startsWith("+")) };
}

const clip = (s: string, max: number) => truncate(s.trim(), max);

export function makeGithubSource(
  getConfig: () => GithubConfig = loadGithubConfig,
): SourceModule {
  return {
    id: "github",
    name: "GitHub datamines",
    enabled: true,
    hosts: ["api.github.com"],
    minIntervalMs: 2000,
    method: "github-api",
    reportNote: TIER_LINE,
    // Unused: change is decided in watch().
    discover: async () => [],
    watch: (ctx) => watchGithub(ctx, getConfig()),
  };
}

async function watchGithub(
  ctx: WatchContext,
  cfg: GithubConfig,
): Promise<WatchResult> {
  const client = new GithubClient(ctx);
  const items: WatchItem[] = [];
  const stats = {
    discovered: 0,
    fetched: 0,
    unchanged: 0,
    deferred: 0,
    errors: 0,
  };
  const maxInline = cfg.max_inline_bytes;

  const listings = new Map<string, Map<string, number> | "deferred" | null>();
  /** File sizes of one directory at the default branch: one call per directory per run. */
  async function sizeOf(
    repo: string,
    path: string,
  ): Promise<number | null | "deferred"> {
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const key = `${repo}:${dir}`;
    if (!listings.has(key)) {
      const res = await client.get(
        `/repos/${repo}/contents${dir ? `/${encodeURI(dir)}` : ""}`,
      );
      if (!res) listings.set(key, "deferred");
      else if (res.outcome !== "ok") {
        stats.errors++;
        ctx.log(
          `[github] ${repo} listing ${dir || "/"}: ${res.outcome} ${res.status}`,
        );
        listings.set(key, null);
      } else {
        const entries =
          parseJson<{ path: string; size: number; type: string }[]>(res);
        listings.set(
          key,
          new Map(
            (Array.isArray(entries) ? entries : [])
              .filter((e) => e.type === "file")
              .map((e) => [e.path, e.size]),
          ),
        );
      }
    }
    const listing = listings.get(key);
    if (listing === "deferred") return "deferred";
    return listing?.get(path) ?? null;
  }

  const compares = new Map<string, Compare | null | "deferred">();
  /** One compare call per repo and sha pair, shared by every path that moved with it. */
  async function compare(
    repo: string,
    from: string,
    to: string,
  ): Promise<Compare | null | "deferred" | "error"> {
    const key = `${repo}:${from}...${to}`;
    const cached = compares.get(key);
    if (cached !== undefined) return cached;
    const res = await client.get(
      `/repos/${repo}/compare/${from}...${to}?per_page=100`,
      { maxBytes: COMPARE_MAX_BYTES },
    );
    let out: Compare | null | "deferred" | "error";
    if (!res) out = "deferred";
    else if (res.outcome === "ok") {
      const body = parseJson<Partial<Compare>>(res);
      out = body
        ? { commits: body.commits ?? [], files: body.files ?? [] }
        : "error";
    } else if (res.status === 404 || res.status === 422) {
      // The old sha is gone (force push): report the file with the commit alone.
      ctx.log(`[github] ${key}: compare ${res.status}, using the commit alone`);
      out = null;
    } else {
      out = "error";
      ctx.log(`[github] ${key}: compare ${res.outcome} ${res.status}`);
    }
    if (out !== "deferred" && out !== "error") compares.set(key, out);
    return out;
  }

  async function firstSighting(
    repo: string,
    path: string,
    commit: Commit,
  ): Promise<WatchCandidate | "deferred"> {
    const head = header(repo, path, commit);
    const size = await sizeOf(repo, path);
    if (size === "deferred") return "deferred";
    let body: string;
    if (size === null) {
      body = "File size unknown: not fetched.";
    } else if (size > maxInline) {
      body = `File size ${size} bytes is over max_inline_bytes (${maxInline}): not fetched.`;
    } else {
      const res = await client.get(
        `/repos/${repo}/contents/${encodeURI(path)}?ref=${commit.sha}`,
        { accept: RAW_ACCEPT, maxBytes: maxInline + 1024 },
      );
      if (!res) return "deferred";
      if (res.outcome === "ok") {
        body = res.text.split("\n").slice(0, INLINE_LINES).join("\n");
      } else {
        stats.errors++;
        ctx.log(
          `[github] ${repo} ${path}: contents ${res.outcome} ${res.status}`,
        );
        body = `File not fetched (${res.outcome} ${res.status}).`;
      }
    }
    return {
      changeKind: "new",
      categoryHint: "datamine",
      rawExtract: `${head.join("\n")}\n\n${body}`,
      hintText: body,
      diffSummary: {
        lines: [
          `First seen at ${commit.sha.slice(0, 7)}: ${firstLine(commit.commit.message)}`,
        ],
      },
    };
  }

  async function modified(
    repo: string,
    path: string,
    from: string,
    commit: Commit,
  ): Promise<WatchCandidate | "deferred" | "error"> {
    const cmp = await compare(repo, from, commit.sha);
    if (cmp === "deferred" || cmp === "error") return cmp;
    const head = header(repo, path, commit);
    const out: string[] = [...head, ""];
    const lines: string[] = [];
    let snippets: string[] = [];
    let hintText = firstLine(commit.commit.message);

    if (!cmp) {
      out.push("Compare unavailable: only the latest commit is known.");
      lines.push("Commits: unknown (compare unavailable)");
    } else {
      const shown = cmp.commits
        .slice(0, COMMIT_LIST_MAX)
        .map(
          (c) =>
            `- ${commitDate(c) ?? "unknown"} ${c.sha.slice(0, 7)} ${firstLine(c.commit.message)}`,
        );
      out.push(
        `Commits in range (${cmp.commits.length}, repo-wide):`,
        ...shown,
      );
      if (cmp.commits.length > shown.length) {
        out.push(`- … and ${cmp.commits.length - shown.length} more`);
      }
      const msgs = cmp.commits
        .slice(0, SNIPPETS)
        .map((c) => clip(firstLine(c.commit.message), 80));
      lines.push(
        `Commits: ${cmp.commits.length}${msgs.length ? ` (${msgs.join("; ")})` : ""}`,
      );
      hintText += `\n${cmp.commits.map((c) => firstLine(c.commit.message)).join("\n")}`;

      const file = cmp.files.find((f) => f.filename === path);
      out.push("");
      if (!file) {
        out.push(
          "File not listed in the compare (only the first 100 files are read).",
        );
      } else {
        out.push(
          `Change: ${file.status ?? "modified"}, +${file.additions ?? 0} / -${file.deletions ?? 0}`,
        );
        lines.push(`+${file.additions ?? 0} / -${file.deletions ?? 0}`);
        if (file.patch === undefined) {
          out.push("No patch: GitHub omits it for large diffs. Counts only.");
        } else {
          const { rows, added } = changedRows(file.patch);
          out.push("", ...rows);
          snippets = added
            .slice(0, SNIPPETS)
            .map((r) => clip(r.slice(1), SNIPPET_CHARS));
          hintText += `\n${added.join("\n")}`;
        }
      }
    }
    return {
      changeKind: "modified",
      categoryHint: "datamine",
      rawExtract: truncate(out.join("\n"), RAW_EXTRACT_MAX),
      hintText,
      diffSummary: { lines, snippets },
    };
  }

  // Watched files.
  for (const { repo, paths } of cfg.watch) {
    for (const path of paths) {
      stats.discovered++;
      const url = `https://github.com/${repo}/blob/HEAD/${path}`;
      const title = `${repo}: ${path}`;
      const row = ctx.stored.get(url);
      const known = row?.contentHash ?? null;

      const res = await client.get(
        `/repos/${repo}/commits?${new URLSearchParams({ path, per_page: "1" })}`,
        { etag: known && row?.etag ? row.etag : undefined },
      );
      if (!res) {
        stats.deferred++;
        continue;
      }
      if (res.outcome === "not-modified") {
        stats.unchanged++;
        items.push({ url, title });
        continue;
      }
      const commits = res.outcome === "ok" ? parseJson<Commit[]>(res) : null;
      const commit = Array.isArray(commits) ? commits[0] : undefined;
      if (!commit?.sha) {
        stats.errors++;
        ctx.log(
          `[github] ${repo} ${path}: ${res.outcome === "ok" ? "no commits for the path" : `${res.outcome} ${res.status}`}`,
        );
        continue;
      }

      const item: WatchItem = {
        url,
        title,
        remoteModified: commitDate(commit),
        etag: res.headers.get("etag"),
        contentHash: commit.sha,
        extract: header(repo, path, commit).join("\n"),
      };
      if (known === commit.sha) {
        stats.unchanged++;
        items.push(item);
        continue;
      }
      const candidate = known
        ? await modified(repo, path, known, commit)
        : await firstSighting(repo, path, commit);
      if (candidate === "deferred") {
        stats.deferred++;
        continue;
      }
      if (candidate === "error") {
        stats.errors++;
        continue;
      }
      items.push({ ...item, candidate });
    }
  }

  // Repo discovery: review only, never auto-watched.
  const last = ctx.stored.get(SEARCH_URL)?.checkedAt ?? null;
  const due =
    ctx.forceDiscovery ||
    !last ||
    ctx.now.getTime() - last.getTime() >= cfg.discovery.every_days * DAY_MS;
  if (due) {
    const found = await discover(client, ctx, cfg, last, stats);
    if (found) {
      items.push(...found, {
        url: SEARCH_URL,
        title: "GitHub repository search: gta6 datamines",
      });
    }
  }

  stats.fetched = client.calls;
  if (client.stopped) {
    ctx.log(
      `[github] ${stats.deferred} request(s) deferred to the next run (${client.stopped})`,
    );
  }
  return { items, stats };
}

/** Null when the search could not run; the search row is then not advanced. */
async function discover(
  client: GithubClient,
  ctx: WatchContext,
  cfg: GithubConfig,
  last: Date | null,
  stats: WatchResult["stats"],
): Promise<WatchItem[] | null> {
  const d = cfg.discovery;
  const since = (
    last ?? new Date(ctx.now.getTime() - FIRST_SEARCH_DAYS * DAY_MS)
  )
    .toISOString()
    .slice(0, 10);
  const params = new URLSearchParams({
    q: `${d.query} pushed:>${since}`,
    sort: "updated",
    order: "desc",
    per_page: "50",
  });
  const res = await client.get(`/search/repositories?${params}`);
  if (!res) {
    ctx.log("[github] discovery search deferred to the next run");
    return null;
  }
  const body = res.outcome === "ok" ? parseJson<{ items?: Repo[] }>(res) : null;
  if (!body) {
    stats.errors++;
    ctx.log(`[github] discovery search: ${res.outcome} ${res.status}`);
    return null;
  }

  const keywords = d.keywords.map((k) => k.toLowerCase());
  const excludes = d.exclude_patterns.map((p) => new RegExp(p, "i"));
  const blocked = new Set(d.blocklist.map((r) => r.toLowerCase()));
  const watched = new Set(cfg.watch.map((w) => w.repo.toLowerCase()));

  const out: WatchItem[] = [];
  for (const repo of body.items ?? []) {
    const id = repo.full_name.toLowerCase();
    if (repo.fork || blocked.has(id) || watched.has(id)) continue;
    if (ctx.stored.has(repo.html_url)) continue;
    const topics = repo.topics ?? [];
    const text = [repo.name, repo.description ?? "", ...topics]
      .join("\n")
      .toLowerCase();
    if (!keywords.some((k) => text.includes(k))) continue;
    if (excludes.some((re) => re.test(text))) continue;

    stats.discovered++;
    const pushed = toIso(repo.pushed_at);
    const description = repo.description ?? "(no description)";
    const rawExtract = [
      `Repo: ${repo.full_name}`,
      `URL: ${repo.html_url}`,
      `Description: ${description}`,
      `Topics: ${topics.join(", ") || "none"}`,
      `Stars: ${repo.stargazers_count}`,
      `Pushed: ${pushed ?? "unknown"}`,
      `License: ${repo.license?.spdx_id ?? repo.license?.name ?? "none"}`,
      `Default branch: ${repo.default_branch}`,
      TIER_LINE,
      "",
      "Review only: not watched. Add to scrapers/config/github.yaml after review.",
    ].join("\n");
    out.push({
      url: repo.html_url,
      title: repo.full_name,
      remoteModified: pushed,
      contentHash: sha256(`${repo.full_name}@${repo.pushed_at ?? ""}`),
      extract: rawExtract.split("\n").slice(0, 3).join("\n"),
      candidate: {
        changeKind: "new",
        categoryHint: "datamine-discovery",
        rawExtract,
        hintText: `${description}\n${topics.join(" ")}`,
        diffSummary: {
          lines: [
            description,
            `${repo.stargazers_count} stars, pushed ${pushed?.slice(0, 10) ?? "unknown"}. Review only: not watched.`,
          ],
        },
      },
    });
  }
  return out;
}

export const github = makeGithubSource();
