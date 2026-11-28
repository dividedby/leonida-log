import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function tokens(pattern: RegExp): Record<string, string> {
  const body = css.match(pattern)?.[1];
  if (body === undefined)
    throw new Error(`globals.css: no match for ${pattern}`);
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]),
  );
}

const light = tokens(/:root,\s*\[data-theme="light"\]\s*\{([^}]*)\}/);
const osDark = tokens(
  /prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/,
);
const forcedDark = tokens(/\n\[data-theme="dark"\]\s*\{([^}]*)\}/);

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme tokens", () => {
  it("OS dark and forced dark carry the same values", () => {
    expect(osDark).toEqual(forcedDark);
  });

  it("dark overrides every light token", () => {
    const names = (t: Record<string, string>) =>
      Object.keys(t).filter((k) => k !== "color-scheme");
    expect(names(forcedDark).sort()).toEqual(names(light).sort());
  });
});

// [foreground, background] pairs that carry small text.
const TEXT_PAIRS = [
  ["--ink", "--ground"],
  ["--ink", "--card"],
  ["--muted", "--ground"],
  ["--muted", "--card"],
  ["--pink-text", "--ground"],
  ["--pink-text", "--card"],
  ["--teal-text", "--ground"],
  ["--teal-text", "--card"],
  ["--on-pink", "--pink-fill"],
  ["--on-teal", "--teal-fill"],
  ["--teal-text", "--on-teal"],
] as const;

// Shapes that must be distinguishable, not read: 3:1.
const SHAPE_PAIRS = [
  ["--pink", "--ground"],
  ["--pink", "--card"],
  ["--muted", "--ground"],
  ["--on-pink", "--pink"],
] as const;

describe.each([
  ["light", light],
  ["dark", forcedDark],
])("%s theme contrast", (_theme, t) => {
  it.each(TEXT_PAIRS)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SHAPE_PAIRS)("%s against %s is at least 3:1", (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(3);
  });
});
