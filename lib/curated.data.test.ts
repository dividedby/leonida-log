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

  it("has Tourist Trap (20), Checking Out (33) and The Cartel Heist (59) as gates, each with checklist items", () => {
    const order = (mission: string) =>
      data.gates.find((g) => g.mission === mission)?.order;
    expect(order("tourist-trap")).toBe(20);
    expect(order("checking-out")).toBe(33);
    expect(order("the-cartel-heist")).toBe(59);
    expect(data.gates.map((g) => g.mission)).toEqual([
      "tourist-trap",
      "checking-out",
      "the-cartel-heist",
    ]);
    for (const gate of data.gates) {
      expect(
        data.items.filter((i) => i.before_gate === gate.mission).length,
      ).toBeGreaterThan(0);
    }
  });
});
