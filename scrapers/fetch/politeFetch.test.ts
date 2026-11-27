import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { fakeNetwork } from "../test-helpers";
import { createPoliteFetcher, ROBOTS_TOKEN, USER_AGENT } from "./politeFetch";

function setup(routes: Parameters<typeof fakeNetwork>[0], interval?: number) {
  const net = fakeNetwork(routes);
  const fetcher = createPoliteFetcher(net.deps);
  const { get, stats } = fetcher.forSource(interval);
  return { net, fetcher, get, stats };
}

describe("user agent", () => {
  it("is descriptive, names the bot, and has none of the tokens IGN blocks", () => {
    expect(USER_AGENT).toMatch(/^LeonidaLogBot\//);
    expect(USER_AGENT.toLowerCase()).toContain(ROBOTS_TOKEN);
    for (const token of ["claude", "code", "cursor", "mozilla"]) {
      expect(USER_AGENT.toLowerCase()).not.toContain(token);
    }
  });

  it("is sent on every request", async () => {
    const { net, get } = setup({ "https://a.test/p": { body: "x" } });
    await get("https://a.test/p");
    expect(net.calls.every((c) => c.headers["user-agent"] === USER_AGENT)).toBe(
      true,
    );
  });
});

describe("rate limiting", () => {
  it("spaces requests to one host by the source interval, robots.txt included", async () => {
    const { net, get } = setup(
      { "https://a.test/1": { body: "1" }, "https://a.test/2": { body: "2" } },
      5000,
    );
    await get("https://a.test/1");
    await get("https://a.test/2");
    const gaps = net.calls.slice(1).map((c, i) => c.at - net.calls[i].at);
    expect(net.calls.map((c) => c.url)).toEqual([
      "https://a.test/robots.txt",
      "https://a.test/1",
      "https://a.test/2",
    ]);
    expect(gaps.every((g) => g >= 5000)).toBe(true);
  });

  it("does not make different hosts wait for each other", async () => {
    const { net, get } = setup({
      "https://a.test/1": { body: "1" },
      "https://b.test/1": { body: "1" },
    });
    await get("https://a.test/1");
    const before = net.clock.sleeps.length;
    await get("https://b.test/1");
    // Only b.test's own robots.txt -> page gap, none for a.test's history.
    expect(net.clock.sleeps.length - before).toBe(1);
  });

  it("raises the interval to the robots.txt Crawl-delay, capped at 60 seconds", async () => {
    const { net, get } = setup(
      {
        "https://a.test/robots.txt": {
          body: "User-agent: *\nCrawl-delay: 20\n",
        },
        "https://a.test/1": { body: "1" },
        "https://c.test/robots.txt": {
          body: "User-agent: *\nCrawl-delay: 600\n",
        },
        "https://c.test/1": { body: "1" },
      },
      1000,
    );
    await get("https://a.test/1");
    await get("https://c.test/1");
    const page = (url: string) => net.calls.find((c) => c.url === url)!;
    const gap = (host: string) =>
      page(`https://${host}/1`).at - page(`https://${host}/robots.txt`).at;
    expect(gap("a.test")).toBeGreaterThanOrEqual(20_000);
    expect(gap("c.test")).toBe(60_000);
  });
});

describe("robots.txt", () => {
  it("skips a disallowed URL without requesting it and counts it", async () => {
    const { net, get, stats } = setup({
      "https://a.test/robots.txt": {
        body: "User-agent: *\nDisallow: /secret\n",
      },
    });
    const res = await get("https://a.test/secret/x");
    expect(res.outcome).toBe("blocked-robots");
    expect(net.pageCalls()).toHaveLength(0);
    expect(stats.robotsBlocked).toBe(1);
  });

  it("fetches robots.txt once per host", async () => {
    const { net, get } = setup({
      "https://a.test/1": { body: "1" },
      "https://a.test/2": { body: "2" },
    });
    await get("https://a.test/1");
    await get("https://a.test/2");
    expect(net.calls.filter((c) => c.url.endsWith("/robots.txt"))).toHaveLength(
      1,
    );
  });

  it("treats a 4xx robots.txt as allow-all and a 5xx as disallow-all", async () => {
    const { get } = setup({
      "https://ok.test/robots.txt": { status: 404 },
      "https://ok.test/p": { body: "x" },
      "https://down.test/robots.txt": { status: 503 },
      "https://down.test/p": { body: "x" },
    });
    expect((await get("https://ok.test/p")).outcome).toBe("ok");
    expect((await get("https://down.test/p")).outcome).toBe("blocked-robots");
  });

  it("checks robots.txt of each redirect hop's host", async () => {
    const { net, get } = setup({
      "https://a.test/old": {
        status: 301,
        headers: { location: "https://b.test/new" },
      },
      "https://b.test/robots.txt": { body: "User-agent: *\nDisallow: /\n" },
      "https://b.test/new": { body: "never" },
    });
    const res = await get("https://a.test/old");
    expect(res.outcome).toBe("blocked-robots");
    expect(net.calls.map((c) => c.url)).not.toContain("https://b.test/new");
  });

  it("follows redirects up to 5 hops", async () => {
    const routes: Parameters<typeof fakeNetwork>[0] = {};
    for (let i = 0; i < 7; i++) {
      routes[`https://a.test/${i}`] = {
        status: 302,
        headers: { location: `https://a.test/${i + 1}` },
      };
    }
    const { get } = setup(routes);
    expect((await get("https://a.test/0")).outcome).toBe("error");
  });
});

describe("conditional requests", () => {
  it("sends the stored validators and reports 304 as not-modified", async () => {
    const { net, get } = setup({ "https://a.test/p": { status: 304 } });
    const res = await get("https://a.test/p", {
      etag: '"abc"',
      lastModified: "Wed, 25 Nov 2026 10:00:00 GMT",
    });
    expect(res.outcome).toBe("not-modified");
    const sent = net.pageCalls()[0].headers;
    expect(sent["if-none-match"]).toBe('"abc"');
    expect(sent["if-modified-since"]).toBe("Wed, 25 Nov 2026 10:00:00 GMT");
  });
});

describe("blocked and throttled hosts", () => {
  it("stops the host after a 403 and answers later requests without a network call", async () => {
    const { net, get, fetcher } = setup({
      "https://a.test/1": { status: 403 },
      "https://a.test/2": { body: "ok" },
    });
    const first = await get("https://a.test/1");
    expect(first).toMatchObject({ outcome: "http-error", status: 403 });
    const second = await get("https://a.test/2");
    expect(second.outcome).toBe("host-stopped");
    expect(net.calls.map((c) => c.url)).not.toContain("https://a.test/2");
    expect(fetcher.stoppedReason("a.test")).toBe("403");
  });

  it("honors Retry-After once, capped at 120 seconds, then succeeds", async () => {
    const { net, get } = setup({
      "https://a.test/p": [
        { status: 429, headers: { "retry-after": "9999" } },
        { body: "fine" },
      ],
    });
    const res = await get("https://a.test/p");
    expect(res.outcome).toBe("ok");
    expect(net.clock.sleeps).toContain(120_000);
  });

  it("stops the host when the retry is throttled too", async () => {
    const { get } = setup({
      "https://a.test/p": { status: 503, headers: { "retry-after": "1" } },
      "https://a.test/q": { body: "x" },
    });
    expect((await get("https://a.test/p")).outcome).toBe("http-error");
    expect((await get("https://a.test/q")).outcome).toBe("host-stopped");
  });

  it("stops the host after 3 consecutive 5xx, and a success in between resets the count", async () => {
    const { net, get, fetcher } = setup({
      "https://a.test/1": { status: 500 },
      "https://a.test/2": { status: 502 },
      "https://a.test/ok": { body: "fine" },
      "https://a.test/3": { status: 500 },
      "https://a.test/4": { status: 500 },
      "https://a.test/5": { status: 500 },
      "https://a.test/6": { body: "never" },
    });
    await get("https://a.test/1");
    await get("https://a.test/2");
    await get("https://a.test/ok");
    expect(fetcher.stoppedReason("a.test")).toBeUndefined();
    await get("https://a.test/3");
    await get("https://a.test/4");
    expect(fetcher.stoppedReason("a.test")).toBeUndefined();
    await get("https://a.test/5");
    expect(fetcher.stoppedReason("a.test")).toMatch(/3 consecutive 5xx/);
    expect((await get("https://a.test/6")).outcome).toBe("host-stopped");
    expect(net.calls.map((c) => c.url)).not.toContain("https://a.test/6");
  });

  it("records other 4xx statuses without stopping the host", async () => {
    const { get } = setup({
      "https://a.test/gone": { status: 404 },
      "https://a.test/p": { body: "x" },
    });
    expect(await get("https://a.test/gone")).toMatchObject({
      outcome: "http-error",
      status: 404,
    });
    expect((await get("https://a.test/p")).outcome).toBe("ok");
  });
});

describe("bodies", () => {
  it("rejects a body over the cap", async () => {
    const { get } = setup({
      "https://a.test/big": { body: "x".repeat(2000) },
    });
    expect((await get("https://a.test/big", { maxBytes: 1000 })).outcome).toBe(
      "error",
    );
  });

  it("gunzips raw gzip bodies", async () => {
    const { get } = setup({
      "https://a.test/s.xml.gz": { body: gzipSync("<urlset></urlset>") },
    });
    expect((await get("https://a.test/s.xml.gz")).text).toBe(
      "<urlset></urlset>",
    );
  });

  it("decodes by the Content-Type charset", async () => {
    const latin1 = Uint8Array.from([0x67, 0x75, 0xed, 0x61]); // "guía"
    const { get } = setup({
      "https://a.test/p": {
        body: latin1,
        headers: { "content-type": "text/html; charset=ISO-8859-1" },
      },
    });
    expect((await get("https://a.test/p")).text).toBe("guía");
  });
});
