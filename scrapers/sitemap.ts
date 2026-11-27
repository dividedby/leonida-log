import { maybeGunzip, type SourceFetch } from "./fetch/politeFetch";
import { toIso } from "./util";

export interface SitemapEntry {
  loc: string;
  /** ISO UTC. */
  lastmod?: string;
}

export interface Sitemap {
  kind: "index" | "urlset";
  entries: SitemapEntry[];
}

function decodeEntities(text: string): string {
  return text
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(Number.parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tag(block: string, name: string): string | undefined {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decodeEntities(m[1].trim()) : undefined;
}

/** Parses a urlset or sitemapindex. Accepts gzip bytes (`.xml.gz`) or text. */
export function parseSitemap(input: string | Uint8Array): Sitemap {
  const xml =
    typeof input === "string"
      ? input
      : new TextDecoder().decode(maybeGunzip(input));
  const kind = /<sitemapindex[\s>]/i.test(xml) ? "index" : "urlset";
  const item = kind === "index" ? "sitemap" : "url";
  const entries: SitemapEntry[] = [];
  for (const m of xml.matchAll(
    new RegExp(`<${item}>([\\s\\S]*?)</${item}>`, "gi"),
  )) {
    const loc = tag(m[1], "loc");
    if (!loc) continue;
    entries.push({ loc, lastmod: toIso(tag(m[1], "lastmod")) });
  }
  return { kind, entries };
}

/** Fetches and parses a sitemap; throws when it can't be read. */
export async function readSitemap(
  fetch: SourceFetch,
  url: string,
): Promise<Sitemap> {
  const res = await fetch(url, {
    accept: "application/xml,text/xml,*/*;q=0.5",
  });
  if (res.outcome !== "ok") {
    throw new Error(
      `sitemap ${url}: ${res.outcome} ${res.status}${res.error ? ` (${res.error})` : ""}`,
    );
  }
  return parseSitemap(res.bytes);
}
