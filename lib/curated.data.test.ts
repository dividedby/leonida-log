import { describe, expect, it } from "vitest";
import { loadCurated } from "./curated-load";
import { gateOptionals, safeToLeave } from "./gates";

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

  it("has optional missions that share no slug with the main missions", () => {
    expect(data.optionalMissions.length).toBeGreaterThan(0);
    const mains = new Set(data.missions.map((m) => m.slug));
    expect(data.optionalMissions.filter((o) => mains.has(o.slug))).toEqual([]);
  });

  it("binds every optional mission that closes to a gate", () => {
    const unbound = data.optionalMissions.filter(
      (o) =>
        o.closesOrder !== null &&
        !data.gates.some((g) => g.order >= (o.closesOrder as number)),
    );
    expect(unbound.map((o) => o.slug)).toEqual([]);
  });

  it("derives the optional rows: Shirley's pair before Tourist Trap, Bad Driver! before Sunset, Veteran Hunted as safe to leave", () => {
    const gate = (mission: string) => {
      const found = data.gates.find((g) => g.mission === mission);
      if (!found) throw new Error(`no gate ${mission}`);
      return found;
    };
    const rows = (mission: string, current: string) =>
      gateOptionals(data, gate(mission), current).map((r) => r.mission.slug);
    expect(rows("tourist-trap", "unwanted-attention")).toEqual(
      expect.arrayContaining(["get-shirleys-rum", "steal-the-scooter"]),
    );
    expect(rows("sunset", "party-hard")).toContain("bad-driver");
    expect(safeToLeave(data, "coffee-break").map((o) => o.slug)).toEqual([
      "veteran-hunted",
    ]);
    expect(safeToLeave(data, "unwanted-attention")).toEqual([]);
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

  it("no item text names an optional mission before the item's visible_after_mission", () => {
    const order = new Map(data.missions.map((m) => [m.slug, m.order]));
    const leaks: string[] = [];
    for (const item of data.items) {
      const visible = order.get(item.visible_after_mission) ?? 0;
      const text = norm(`${item.title} ${item.how_to} ${item.location ?? ""}`);
      for (const o of data.optionalMissions) {
        if (o.opensOrder > visible && text.includes(norm(o.title))) {
          leaks.push(`${item.id} names ${o.title}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it("no optional mission's title or note names a main mission after its opens_after, except its gate", () => {
    const leaks: string[] = [];
    for (const o of data.optionalMissions) {
      const gate = data.gates.find(
        (g) => o.closesOrder !== null && g.order >= o.closesOrder,
      );
      const banned = [
        ...data.missions
          .filter((m) => m.order > o.opensOrder && m.slug !== gate?.mission)
          .map((m) => m.title),
        ...offListLate,
      ];
      const text = norm(`${o.title} ${o.note ?? ""}`);
      for (const title of banned) {
        if (text.includes(norm(title))) leaks.push(`${o.slug} names ${title}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("no gate lost entry names a mission (the app shows it as a countdown)", () => {
    const titles = [...data.missions, ...data.optionalMissions].map(
      (m) => m.title,
    );
    const leaks: string[] = [];
    for (const gate of data.gates) {
      for (const entry of gate.lost) {
        for (const title of [...titles, ...offListLate]) {
          if (norm(entry).includes(norm(title))) {
            leaks.push(`${gate.mission}: "${entry}" names ${title}`);
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
