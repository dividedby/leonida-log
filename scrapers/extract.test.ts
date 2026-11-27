import { describe, expect, it } from "vitest";
import { extractHtml } from "./extract";

const page = (body: string, head = "") =>
  `<html><head><title>Fallback Title</title>${head}</head><body>
  <nav><a href="/">Home</a></nav>${body}<footer>Footer links</footer></body></html>`;

describe("extractHtml", () => {
  it("keeps headings, paragraphs, list items and drops page chrome", () => {
    const ex = extractHtml(
      page(
        `<main><h1>Made Up Guide</h1><p>First   paragraph
        with  spacing.</p><h2>Part two</h2><ul><li>Step <b>one</b><ul><li>Nested</li></ul></li></ul>
        <script>var x = 1;</script><aside>Related</aside></main>`,
      ),
      "https://a.test/p",
    );
    expect(ex.title).toBe("Made Up Guide");
    expect(ex.headings).toEqual(["Made Up Guide", "Part two"]);
    expect(ex.text).toBe(
      [
        "# Made Up Guide",
        "First paragraph with spacing.",
        "## Part two",
        "- Step one",
        "- Nested",
      ].join("\n"),
    );
  });

  it("uses the first selector that matches, then falls back to main/article/body", () => {
    const html = page(
      `<div class="entry"><p>Inside</p></div><main><p>Outside</p></main>`,
    );
    expect(extractHtml(html, "u", { selectors: [".entry"] }).text).toBe(
      "Inside",
    );
    expect(extractHtml(html, "u", { selectors: [".missing"] }).text).toBe(
      "Outside",
    );
  });

  it("extracts an HTML fragment with no body element", () => {
    expect(extractHtml("<p>Only a fragment</p>", "u").text).toBe(
      "Only a fragment",
    );
  });

  it("gives the same hash when only dates, view counts and timestamps change", () => {
    const render = (updated: string, views: string, time: string) =>
      extractHtml(
        page(
          `<main><h1>Guide</h1><p>Updated: ${updated}</p><p>${views} views</p><p>Posted <time>${time}</time></p><p>Real content.</p></main>`,
        ),
        "u",
      );
    const a = render("Nov 20, 2026", "1,200", "10:00");
    const b = render("Nov 25, 2026", "9,800", "17:45");
    expect(a.hash).toBe(b.hash);
  });

  it("changes the hash when content changes, and keeps headings that start with 'Updated'", () => {
    const a = extractHtml(
      page("<main><h2>Updated weapons list</h2><p>One.</p></main>"),
      "u",
    );
    const b = extractHtml(
      page("<main><h2>Updated weapons list</h2><p>Two.</p></main>"),
      "u",
    );
    expect(a.hash).not.toBe(b.hash);
    expect(a.headings).toEqual(["Updated weapons list"]);
  });

  it("reads JSON-LD dateModified, including inside @graph", () => {
    const ld = `<script type="application/ld+json">{"@graph":[{"@type":"Article","dateModified":"2026-11-24T08:00:00+09:00"}]}</script>`;
    const ex = extractHtml(page("<main><p>Text</p></main>", ld), "u");
    expect(ex.remoteModified).toBe("2026-11-23T23:00:00.000Z");
  });
});
