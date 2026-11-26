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

  it("has Tourist Trap (20), Checking Out (33), The Cartel Heist (59) and Sunset (83) as gates, each with checklist items", () => {
    const order = (mission: string) =>
      data.gates.find((g) => g.mission === mission)?.order;
    expect(order("tourist-trap")).toBe(20);
    expect(order("checking-out")).toBe(33);
    expect(order("the-cartel-heist")).toBe(59);
    expect(order("sunset")).toBe(83);
    expect(data.gates.map((g) => g.mission)).toEqual([
      "tourist-trap",
      "checking-out",
      "the-cartel-heist",
      "sunset",
    ]);
    for (const gate of data.gates) {
      expect(
        data.items.filter((i) => i.before_gate === gate.mission).length,
      ).toBeGreaterThan(0);
    }
  });

  // ADR 0002 (amended 2026-11-26): item text may not name a mission after the
  // item's visible_after_mission, except its own gate's title. Ch5 missions
  // outside the Story Recap list come after every gate.
  const offListLate = ["Honest Abe", "Pay Abe's Fee", "Unfinished Business"];
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  it("no item text names a mission after its visible_after_mission, except its own gate", () => {
    const order = new Map(data.missions.map((m) => [m.slug, m.order]));
    const leaks: string[] = [];
    for (const item of data.items) {
      const visible = order.get(item.visible_after_mission) ?? 0;
      const banned = [
        ...data.missions
          .filter((m) => m.order > visible && m.slug !== item.before_gate)
          .map((m) => m.title),
        ...offListLate,
      ];
      const text = norm(`${item.title} ${item.how_to} ${item.location ?? ""}`);
      for (const title of banned) {
        if (text.includes(norm(title))) {
          leaks.push(`${item.id} names ${title}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
