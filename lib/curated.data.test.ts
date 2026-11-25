import { describe, expect, it } from "vitest";
import { loadCurated } from "./curated-load";

// Fails on any invalid edit to data/curated.
describe("real curated data", () => {
  const data = loadCurated();

  it("has 5 chapters with 22/11/26/25/7 missions (91 total)", () => {
    expect(data.chapters.map((c) => c.missionCount)).toEqual([
      22, 11, 26, 25, 7,
    ]);
    expect(data.missions).toHaveLength(91);
  });

  it("has Tourist Trap as mission 20 with checklist items, and Checking Out as mission 33", () => {
    const order = (mission: string) =>
      data.gates.find((g) => g.mission === mission)?.order;
    expect(order("tourist-trap")).toBe(20);
    expect(order("checking-out")).toBe(33);
    expect(
      data.items.filter((i) => i.before_gate === "tourist-trap").length,
    ).toBeGreaterThan(0);
  });
});
