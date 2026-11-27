import type { SourceFetch } from "./fetch/politeFetch";

export interface Capture {
  /** Wayback timestamp, YYYYMMDDhhmmss (UTC). */
  timestamp: string;
  original: string;
  statusCode: string;
  digest: string;
}

export interface CaptureQuery {
  /** YYYYMMDD or a longer Wayback timestamp. */
  from?: string;
  to?: string;
  matchType?: "exact" | "prefix" | "host" | "domain";
  limit?: number;
}

const CDX = "https://web.archive.org/cdx/search/cdx";

/** `https://web.archive.org/web/<ts>id_/<url>`: the capture without Wayback's page rewriting. */
export function rawCaptureUrl(timestamp: string, url: string): string {
  return `https://web.archive.org/web/${timestamp}id_/${url}`;
}

/** Wayback timestamp to ISO UTC. */
export function captureIso(timestamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(timestamp);
  if (!m) throw new Error(`bad Wayback timestamp ${timestamp}`);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}.000Z`;
}

/** Wayback CDX listing of 200 captures, collapsed by content digest. Goes through the polite fetch. */
export async function captures(
  fetch: SourceFetch,
  url: string,
  query: CaptureQuery = {},
): Promise<Capture[]> {
  const params = new URLSearchParams({
    url,
    output: "json",
    fl: "timestamp,original,statuscode,digest",
    collapse: "digest",
  });
  params.append("filter", "statuscode:200");
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.matchType) params.set("matchType", query.matchType);
  if (query.limit) params.set("limit", String(query.limit));

  const res = await fetch(`${CDX}?${params}`, { accept: "application/json" });
  if (res.outcome !== "ok") {
    throw new Error(`Wayback CDX ${res.outcome} ${res.status}`);
  }
  const rows = res.text.trim() ? (JSON.parse(res.text) as string[][]) : [];
  // First row is the header.
  return rows.slice(1).map(([timestamp, original, statusCode, digest]) => ({
    timestamp,
    original,
    statusCode,
    digest,
  }));
}
