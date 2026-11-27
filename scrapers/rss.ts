import { decodeEntities } from "./sitemap";
import { toIso } from "./util";

export interface RssItem {
  title: string;
  link: string;
  /** ISO UTC, from `pubDate`. */
  published?: string;
  categories: string[];
  /** Full article HTML: `content:encoded` when the feed has it, else `description`. */
  html: string;
}

/** CDATA content is literal text, so `&amp;lt;` stays `&lt;`; anything else is entity-decoded once. */
function text(raw: string): string {
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw.trim());
  return cdata ? cdata[1] : decodeEntities(raw.trim());
}

function tag(block: string, name: string): string | undefined {
  const m = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,
    "i",
  ).exec(block);
  return m ? text(m[1]) : undefined;
}

/** Parses RSS 2.0 `<item>`s; items without a title or link are dropped. */
export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    const link = tag(block, "link");
    const title = tag(block, "title");
    if (!link || !title) continue;
    items.push({
      title,
      link,
      published: toIso(tag(block, "pubDate")),
      categories: [
        ...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi),
      ].map((c) => text(c[1])),
      html: tag(block, "content:encoded") ?? tag(block, "description") ?? "",
    });
  }
  return items;
}
