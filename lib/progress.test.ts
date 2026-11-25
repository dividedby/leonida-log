import { describe, expect, it } from "vitest";
import { formatCount, progressPercent } from "./progress";

describe("progressPercent", () => {
  it.each([
    { name: "total 0", done: 0, total: 0, expected: 0 },
    { name: "negative total", done: 3, total: -1, expected: 0 },
    { name: "done 0", done: 0, total: 7, expected: 0 },
    { name: "rounds down", done: 1, total: 3, expected: 33 },
    { name: "rounds up", done: 2, total: 3, expected: 67 },
    { name: "complete", done: 7, total: 7, expected: 100 },
    { name: "done over total clamps to 100", done: 9, total: 7, expected: 100 },
    { name: "negative done clamps to 0", done: -2, total: 7, expected: 0 },
  ])("$name", ({ done, total, expected }) => {
    expect(progressPercent(done, total)).toBe(expected);
  });
});

describe("formatCount", () => {
  it("formats done/total", () => {
    expect(formatCount(3, 7)).toBe("3/7");
  });
});
