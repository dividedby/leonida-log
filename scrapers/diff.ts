import type { ChangeKind } from "../lib/db/schema";
import { truncate } from "./util";

export interface Diff {
  kind: ChangeKind;
  headingsAdded: string[];
  headingsRemoved: string[];
  paragraphsAdded: number;
  paragraphsRemoved: number;
  /** Up to 3 added paragraphs, each at most 160 characters. */
  snippets: string[];
}

const MAX_HEADINGS = 20;
const MAX_SNIPPETS = 3;
const SNIPPET_LENGTH = 160;
const HEADING = /^#{1,4} /;

function counts(lines: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of lines) map.set(l, (map.get(l) ?? 0) + 1);
  return map;
}

/** Lines in `a` beyond the copies `b` has, in `a`'s order. */
function surplus(a: string[], b: string[]): string[] {
  const remaining = counts(b);
  const out: string[] = [];
  for (const line of a) {
    const left = remaining.get(line) ?? 0;
    if (left > 0) remaining.set(line, left - 1);
    else out.push(line);
  }
  return out;
}

/** Compares two extract texts (see Extract.text). `previous` null means a new page. */
export function diffExtracts(previous: string | null, next: string): Diff {
  const prevLines = previous ? previous.split("\n") : [];
  const nextLines = next ? next.split("\n") : [];
  const added = surplus(nextLines, prevLines);
  const removed = surplus(prevLines, nextLines);
  const headingText = (l: string) => l.replace(HEADING, "");
  const paragraphs = (ls: string[]) => ls.filter((l) => !HEADING.test(l));
  const addedParagraphs = paragraphs(added);
  return {
    kind: previous === null ? "new" : "modified",
    headingsAdded: added
      .filter((l) => HEADING.test(l))
      .map(headingText)
      .slice(0, MAX_HEADINGS),
    headingsRemoved: removed
      .filter((l) => HEADING.test(l))
      .map(headingText)
      .slice(0, MAX_HEADINGS),
    paragraphsAdded: addedParagraphs.length,
    paragraphsRemoved: paragraphs(removed).length,
    snippets: addedParagraphs
      .slice(0, MAX_SNIPPETS)
      .map((l) => truncate(l.replace(/^- /, ""), SNIPPET_LENGTH)),
  };
}
