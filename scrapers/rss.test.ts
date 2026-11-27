import { describe, expect, it } from "vitest";
import { parseRss } from "./rss";

const item = (inner: string) =>
  `<rss><channel><item>${inner}</item></channel></rss>`;

describe("parseRss", () => {
  it("decodes entities once outside CDATA and not at all inside it", () => {
    const [parsed] = parseRss(
      item(
        `<title>A &amp;amp; B</title><link>https://a.test/x/</link>` +
          `<category><![CDATA[R&amp;D &amp;lt;b&amp;gt;]]></category>` +
          `<description><![CDATA[<p>1 &amp;lt; 2 &amp; 3</p>]]></description>`,
      ),
    );
    expect(parsed.title).toBe("A &amp; B");
    expect(parsed.categories).toEqual(["R&amp;D &amp;lt;b&amp;gt;"]);
    expect(parsed.html).toBe("<p>1 &amp;lt; 2 &amp; 3</p>");
  });

  it("reads pubDate as ISO UTC, prefers content:encoded and drops items without a link", () => {
    const xml = `<rss><channel>${[
      `<item><title>T</title><link>https://a.test/x/</link><pubDate>Fri, 27 Nov 2026 14:00:00 +0000</pubDate><description>short</description><content:encoded><![CDATA[<p>full</p>]]></content:encoded></item>`,
      `<item><title>No link</title></item>`,
    ].join("")}</channel></rss>`;
    const items = parseRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0].published).toBe("2026-11-27T14:00:00.000Z");
    expect(items[0].html).toBe("<p>full</p>");
  });
});
