import { parse, type HTMLElement, type Node } from "node-html-parser";
import type { Extract } from "./types";
import { sha256, toIso } from "./util";

export interface ExtractOptions {
  /** Tried in order; the first with text wins. Falls back to main, article, body, then the whole document. */
  selectors?: string[];
}

const FALLBACK_SELECTORS = ["main", "article", "body"];
const STRIP =
  "script, style, nav, footer, aside, form, iframe, noscript, time, svg, button, template";
const BLOCKS = "h1,h2,h3,h4,p,li,td,th,figcaption";
// Children whose text belongs to their own line, not the parent's.
const NESTED_BLOCK = new Set([
  "p",
  "li",
  "ul",
  "ol",
  "h1",
  "h2",
  "h3",
  "h4",
  "div",
  "table",
  "tr",
  "td",
  "th",
  "blockquote",
  "section",
  "figure",
  "figcaption",
  "dl",
  "dt",
  "dd",
]);

// Dynamic noise that would flip the hash without a content change.
const NOISE: RegExp[] = [
  /^(last\s+)?(updated|modified|published|posted)\b[\s:\-–]*(on\s+)?(\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  /^(最終更新|更新日|公開日|投稿日|更新)/,
  /^actualizad[oa]\b/i,
  /^[\d.,]+\s*(k\s+)?(views?|vistas?|回閲覧)$/i,
];

function ownText(el: HTMLElement): string {
  let out = "";
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      const child = n as HTMLElement;
      if (child.tagName) {
        if (NESTED_BLOCK.has(child.tagName.toLowerCase())) continue;
        walk(child.childNodes);
      } else {
        out += n.text;
      }
    }
  };
  walk(el.childNodes);
  return out.replace(/\s+/g, " ").trim();
}

function findDateModified(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findDateModified(v);
      if (found) return found;
    }
  } else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.dateModified === "string") return toIso(obj.dateModified);
    return findDateModified(obj["@graph"]);
  }
  return undefined;
}

function jsonLdModified(root: HTMLElement): string | undefined {
  for (const script of root.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      const found = findDateModified(JSON.parse(script.rawText));
      if (found) return found;
    } catch {
      // Malformed JSON-LD is common; ignore it.
    }
  }
  return undefined;
}

/** Generic main-content extractor: headings, paragraphs, list items and table cells as normalized lines. */
export function extractHtml(
  html: string,
  _url: string,
  options: ExtractOptions = {},
): Extract {
  const doc = parse(html);
  const remoteModified = jsonLdModified(doc);
  const docTitle =
    doc.querySelector("h1")?.text ?? doc.querySelector("title")?.text ?? "";

  doc.querySelectorAll(STRIP).forEach((n) => n.remove());
  doc.querySelectorAll("br").forEach((n) => n.replaceWith(" "));

  let root: HTMLElement = doc;
  for (const selector of [
    ...(options.selectors ?? []),
    ...FALLBACK_SELECTORS,
  ]) {
    const found = doc.querySelector(selector);
    if (found && found.text.trim()) {
      root = found;
      break;
    }
  }

  const lines: string[] = [];
  const headings: string[] = [];
  for (const el of root.querySelectorAll(BLOCKS)) {
    const text = ownText(el);
    if (!text || NOISE.some((re) => re.test(text))) continue;
    const tagName = el.tagName.toLowerCase();
    if (/^h[1-4]$/.test(tagName)) {
      headings.push(text);
      lines.push(`${"#".repeat(Number(tagName[1]))} ${text}`);
    } else if (tagName === "li") {
      lines.push(`- ${text}`);
    } else {
      lines.push(text);
    }
  }

  const text = lines.join("\n");
  return {
    title: docTitle.replace(/\s+/g, " ").trim(),
    text,
    headings,
    hash: sha256(text),
    remoteModified,
  };
}

/** Builds a per-source extractor with its own selector list. */
export function extractorFor(
  selectors: string[],
): (html: string, url: string) => Extract {
  return (html, url) => extractHtml(html, url, { selectors });
}
