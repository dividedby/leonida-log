import { describe, expect, it } from "vitest";
import { Robots } from "./robots";

const parse = (text: string) => Robots.parse(text, "leonidalogbot");

describe("group selection", () => {
  it("uses the group naming our token over *, case-insensitively", () => {
    const r = parse(
      "User-agent: *\nDisallow: /\n\nUser-agent: LeonidaLogBot\nDisallow: /private\n",
    );
    expect(r.isAllowed("/guide")).toBe(true);
    expect(r.isAllowed("/private/x")).toBe(false);
  });

  it("falls back to * when no group names us", () => {
    const r = parse(
      "User-agent: otherbot\nAllow: /\n\nUser-agent: *\nDisallow: /a\n",
    );
    expect(r.isAllowed("/a")).toBe(false);
    expect(r.isAllowed("/b")).toBe(true);
  });

  it("allows everything when there is no * group and none names us", () => {
    expect(parse("User-agent: googlebot\nDisallow: /\n").isAllowed("/x")).toBe(
      true,
    );
  });

  it("shares one rule set across stacked user-agent lines and merges repeated groups", () => {
    const r = parse(
      "User-agent: a\nUser-agent: leonidalogbot\nDisallow: /one\n\nUser-agent: leonidalogbot\nDisallow: /two\n",
    );
    expect(r.isAllowed("/one")).toBe(false);
    expect(r.isAllowed("/two")).toBe(false);
    expect(r.isAllowed("/three")).toBe(true);
  });
});

describe("matching", () => {
  it.each([
    ["wildcard", "Disallow: /*?", "/page?x=1", false],
    ["wildcard, no query", "Disallow: /*?", "/page", true],
    ["end anchor matches", "Disallow: /*.pdf$", "/a/b.pdf", false],
    ["end anchor stops at suffix", "Disallow: /*.pdf$", "/a/b.pdf?x", true],
    ["prefix", "Disallow: /wp-json/", "/wp-json/wp/v2/posts", false],
    ["empty Disallow allows all", "Disallow:", "/anything", true],
    // RFC 9309 2.2.2: raw UTF-8 in a rule matches the percent-encoded path.
    [
      "UTF-8 rule, encoded path",
      "Disallow: /攻略/",
      "/%E6%94%BB%E7%95%A5/x",
      false,
    ],
    [
      "encoding case-insensitive",
      "Disallow: /%e6%94%bb",
      "/%E6%94%BB/x",
      false,
    ],
  ])("%s", (_name, rule, path, allowed) => {
    expect(parse(`User-agent: *\n${rule}\n`).isAllowed(path)).toBe(allowed);
  });

  it("longest match wins", () => {
    const r = parse("User-agent: *\nDisallow: /a\nAllow: /a/b\n");
    expect(r.isAllowed("/a/b/c")).toBe(true);
    expect(r.isAllowed("/a/c")).toBe(false);
  });

  it("Allow wins a tie", () => {
    const r = parse("User-agent: *\nDisallow: /a\nAllow: /a\n");
    expect(r.isAllowed("/a")).toBe(true);
  });

  it("ignores comments and CRLF line endings", () => {
    const r = parse("User-agent: * # everyone\r\nDisallow: /x # no\r\n");
    expect(r.isAllowed("/x")).toBe(false);
  });
});

describe("unavailable robots.txt", () => {
  it("allowAll (4xx) allows everything and disallowAll (5xx) allows nothing", () => {
    expect(Robots.allowAll().isAllowed("/x")).toBe(true);
    expect(Robots.disallowAll().isAllowed("/")).toBe(false);
    expect(Robots.disallowAll().isAllowed("/x")).toBe(false);
  });
});

describe("crawl-delay", () => {
  it("reads it from the selected group only", () => {
    expect(parse("User-agent: *\nCrawl-delay: 10\n").crawlDelaySec).toBe(10);
    expect(
      parse(
        "User-agent: *\nCrawl-delay: 10\n\nUser-agent: leonidalogbot\nCrawl-delay: 3\n",
      ).crawlDelaySec,
    ).toBe(3);
    expect(
      parse("User-agent: *\nDisallow: /x\n").crawlDelaySec,
    ).toBeUndefined();
  });
});
