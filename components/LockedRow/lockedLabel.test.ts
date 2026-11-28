import { describe, expect, it } from "vitest";
import { lockedLabel } from "./lockedLabel";

describe("lockedLabel", () => {
  it.each([
    { count: 1, expected: "1 more unlocks after Day Release" },
    { count: 2, expected: "2 more unlock after Day Release" },
    { count: 4, expected: "4 more unlock after Day Release" },
  ])("count $count", ({ count, expected }) => {
    expect(lockedLabel(count, "Day Release")).toBe(expected);
  });
});
