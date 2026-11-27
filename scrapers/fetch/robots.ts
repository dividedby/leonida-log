// RFC 9309 robots.txt: group selection by product token, Allow/Disallow with
// `*` and `$`, longest match wins, Allow wins ties.

interface Rule {
  allow: boolean;
  length: number;
  pattern: RegExp;
}

interface Group {
  agents: string[];
  rules: Rule[];
  crawlDelaySec?: number;
}

/**
 * RFC 9309 2.2.2: compare in percent-encoded form. Encodes non-ASCII
 * characters and upper-cases existing %xx escapes, in rules and paths alike.
 */
function normalizeEncoding(s: string): string {
  return s
    .replace(/[^\x00-\x7F]+/g, (m) => encodeURIComponent(m))
    .replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
}

function compile(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = normalizeEncoding(anchored ? pattern.slice(0, -1) : pattern);
  const source = body
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`);
}

export class Robots {
  private readonly rules: Rule[];
  /** Crawl-delay in seconds from the selected group, if any. */
  readonly crawlDelaySec?: number;

  private constructor(rules: Rule[], crawlDelaySec?: number) {
    this.rules = rules;
    this.crawlDelaySec = crawlDelaySec;
  }

  /** 4xx on robots.txt: everything is allowed. */
  static allowAll(): Robots {
    return new Robots([]);
  }

  /** 5xx or network failure on robots.txt: nothing is allowed. */
  static disallowAll(): Robots {
    return new Robots([{ allow: false, length: 1, pattern: /^\// }]);
  }

  /**
   * Parses `text` and keeps the group for `token` (lowercase product token),
   * or the `*` group when none names it. Groups naming the same agent merge.
   */
  static parse(text: string, token: string): Robots {
    const groups: Group[] = [];
    let current: Group | undefined;
    let inAgents = false;

    for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim();
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const key = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();

      if (key === "user-agent") {
        if (!current || !inAgents) {
          current = { agents: [], rules: [] };
          groups.push(current);
        }
        current.agents.push(value.toLowerCase());
        inAgents = true;
      } else if (key === "allow" || key === "disallow") {
        if (!current) continue;
        inAgents = false;
        // An empty value matches nothing.
        if (value === "") continue;
        current.rules.push({
          allow: key === "allow",
          length: normalizeEncoding(value).length,
          pattern: compile(value),
        });
      } else if (key === "crawl-delay") {
        if (!current) continue;
        inAgents = false;
        const n = Number.parseFloat(value);
        if (Number.isFinite(n) && n >= 0) current.crawlDelaySec ??= n;
      }
    }

    let selected = groups.filter((g) => g.agents.includes(token));
    if (selected.length === 0) {
      selected = groups.filter((g) => g.agents.includes("*"));
    }
    return new Robots(
      selected.flatMap((g) => g.rules),
      selected.find((g) => g.crawlDelaySec !== undefined)?.crawlDelaySec,
    );
  }

  /** `pathAndQuery` is the URL path plus query string, e.g. `/a/b?c=1`. */
  isAllowed(pathAndQuery: string): boolean {
    const path = normalizeEncoding(pathAndQuery);
    let best: Rule | undefined;
    for (const rule of this.rules) {
      if (!rule.pattern.test(path)) continue;
      if (
        !best ||
        rule.length > best.length ||
        (rule.length === best.length && rule.allow && !best.allow)
      ) {
        best = rule;
      }
    }
    return best ? best.allow : true;
  }
}
