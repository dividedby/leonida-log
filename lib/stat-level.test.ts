import { describe, expect, it } from "vitest";
import { MAX_STAT_LEVEL, clampLevel, ringDash } from "./stat-level";

describe("clampLevel", () => {
  it.each([
    { name: "in range", level: 3, expected: 3 },
    { name: "zero", level: 0, expected: 0 },
    { name: "max", level: MAX_STAT_LEVEL, expected: MAX_STAT_LEVEL },
    { name: "above max", level: 5, expected: MAX_STAT_LEVEL },
    { name: "negative", level: -2, expected: 0 },
    { name: "NaN", level: NaN, expected: 0 },
    { name: "Infinity", level: Infinity, expected: 0 },
    { name: "rounds down", level: 2.4, expected: 2 },
    { name: "rounds up", level: 2.6, expected: 3 },
    { name: "fraction above max", level: 4.4, expected: MAX_STAT_LEVEL },
  ])("$name", ({ level, expected }) => {
    expect(clampLevel(level)).toBe(expected);
  });
});

describe("ringDash", () => {
  it.each([
    { name: "empty ring", level: 0, expected: 0 },
    { name: "half", level: 2, expected: 50 },
    { name: "full", level: 4, expected: 100 },
    { name: "above max stays full", level: 9, expected: 100 },
    { name: "NaN stays empty", level: NaN, expected: 0 },
  ])("$name", ({ level, expected }) => {
    expect(ringDash(level, 100)).toBe(expected);
  });
});
