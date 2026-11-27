import { describe, expect, it } from "vitest";
import { fixtureData } from "../lib/test-fixtures/curated";
import { createHinter } from "./hints";

const hints = createHinter(fixtureData());

describe("hints", () => {
  it("matches mission titles in the page title and text and points at the next gate", () => {
    const h = hints("Walkthrough", "After you finish MISSION M2, head out.");
    expect(h.missionSlugs).toEqual(["m2"]);
    expect(h.gateHint).toBe("m3");
  });

  it("uses the latest main mission named, so a later mention moves the gate", () => {
    const h = hints("Mission m1", "Later you reach Mission m4.");
    expect(h.missionSlugs).toEqual(["m1", "m4"]);
    expect(h.gateHint).toBe("m7");
  });

  it("matches optional missions but derives the gate from main missions only", () => {
    const h = hints("", "Optional o1 is a side job.");
    expect(h.missionSlugs).toEqual(["o1"]);
    expect(h.gateHint).toBeNull();
  });

  it("respects word boundaries and gives no hint when nothing matches", () => {
    expect(hints("", "Mission m10 and Mission m2x").missionSlugs).toEqual([]);
    expect(hints("", "Nothing relevant.").gateHint).toBeNull();
  });

  it("gives no gate when the mission is past the last gate", () => {
    expect(hints("", "Mission m8").gateHint).toBeNull();
  });
});
