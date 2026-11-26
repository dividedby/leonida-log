import { afterEach, describe, expect, it } from "vitest";
import { fixtureData } from "../test-fixtures/curated";
import { openDatabase, type OpenedDatabase } from "./open";
import {
  createRepository,
  InvalidValueError,
  UnknownRefError,
} from "./repository";
import { tempDbs } from "./test-helpers";

const dbs = tempDbs();
const curated = fixtureData();

const connections: OpenedDatabase[] = [];
afterEach(() => {
  for (const c of connections.splice(0)) c.close();
});

function open(file: string) {
  const opened = openDatabase(file);
  connections.push(opened);
  return { opened, repo: createRepository(opened.db, curated) };
}

function setup() {
  return open(dbs.fresh());
}

describe("progress", () => {
  it("starts with no mission, safe spoilers and the system theme", () => {
    expect(setup().repo.getProgress()).toEqual({
      currentMission: null,
      spoilerMode: "safe",
      theme: "system",
    });
  });

  it("persists mission, spoiler mode and theme across a reopened connection", () => {
    const file = dbs.fresh();
    const first = open(file);
    first.repo.setCurrentMission("m3");
    first.repo.setSpoilerMode("open");
    first.repo.setTheme("dark");
    first.opened.close();

    expect(open(file).repo.getProgress()).toEqual({
      currentMission: "m3",
      spoilerMode: "open",
      theme: "dark",
    });
  });

  it("keeps the mission when only a setting changes, and the settings when the mission changes", () => {
    const { repo } = setup();
    repo.setSpoilerMode("open");
    expect(repo.getProgress().currentMission).toBeNull();
    repo.setCurrentMission("m2");
    repo.setCurrentMission("m4");
    expect(repo.getProgress()).toMatchObject({
      currentMission: "m4",
      spoilerMode: "open",
    });
  });

  it("rejects an optional mission as the current mission", () => {
    const { repo } = setup();
    expect(() => repo.setCurrentMission("o1")).toThrow(UnknownRefError);
    expect(repo.getProgress().currentMission).toBeNull();
  });

  it("rejects an unknown mission without writing", () => {
    const { repo } = setup();
    repo.setCurrentMission("m2");
    expect(() => repo.setCurrentMission("nope")).toThrow(UnknownRefError);
    expect(repo.getProgress().currentMission).toBe("m2");
  });

  it.each([
    [
      "spoiler mode",
      (r: ReturnType<typeof setup>["repo"]) =>
        r.setSpoilerMode("loud" as never),
    ],
    [
      "theme",
      (r: ReturnType<typeof setup>["repo"]) => r.setTheme("sepia" as never),
    ],
  ])("rejects an invalid %s", (_name, act) => {
    const { repo } = setup();
    expect(() => act(repo)).toThrow(InvalidValueError);
  });
});

describe("item checks", () => {
  it("toggles an item on and off", () => {
    const { repo } = setup();
    expect(repo.toggleItem("a", new Date(5))).toBe(true);
    expect(repo.toggleItem("b")).toBe(true);
    expect(repo.checkedItemIds()).toEqual(new Set(["a", "b"]));
    expect(repo.toggleItem("a")).toBe(false);
    expect(repo.checkedItemIds()).toEqual(new Set(["b"]));
  });

  it("ticks an optional mission's derived row", () => {
    const { repo } = setup();
    expect(repo.toggleItem("o1")).toBe(true);
    expect(repo.checkedItemIds()).toEqual(new Set(["o1"]));
    expect(repo.toggleItem("o1")).toBe(false);
  });

  it("rejects an unknown item without writing", () => {
    const { repo } = setup();
    expect(() => repo.toggleItem("nope")).toThrow(UnknownRefError);
    expect(repo.checkedItemIds().size).toBe(0);
  });
});

describe("stat levels", () => {
  it("upserts per character and stat", () => {
    const { repo } = setup();
    repo.setStatLevel("jason", "strength", 2);
    repo.setStatLevel("jason", "strength", 3);
    repo.setStatLevel("lucia", "strength", 1);
    expect(repo.getStatLevels()).toEqual(
      expect.arrayContaining([
        { character: "jason", stat: "strength", level: 3 },
        { character: "lucia", stat: "strength", level: 1 },
      ]),
    );
    expect(repo.getStatLevels()).toHaveLength(2);
  });

  it.each([
    ["level above 4", "jason", "strength", 5],
    ["negative level", "jason", "strength", -1],
    ["fractional level", "jason", "strength", 1.5],
    ["unknown character", "franklin", "strength", 1],
    ["unknown stat", "jason", "stamina", 1],
  ])("rejects %s", (_name, character, stat, level) => {
    const { repo } = setup();
    expect(() =>
      repo.setStatLevel(character as never, stat as never, level),
    ).toThrow(InvalidValueError);
    expect(repo.getStatLevels()).toHaveLength(0);
  });
});

describe("workouts", () => {
  it("returns null before any workout", () => {
    expect(setup().repo.lastWorkout("jason", "strength")).toBeNull();
  });

  it("returns the latest workout per character and stat, including out-of-order logs", () => {
    const file = dbs.fresh();
    const first = open(file);
    first.repo.logWorkout("jason", "strength", new Date(2_000));
    first.repo.logWorkout("jason", "strength", new Date(1_000));
    first.repo.logWorkout("jason", "cardio", new Date(500));
    first.repo.logWorkout("lucia", "strength", new Date(9_000));
    first.repo.logWorkout("jason", "focus", new Date(700));
    first.opened.close();

    const { repo } = open(file);
    expect(repo.lastWorkout("jason", "strength")).toEqual(new Date(2_000));
    expect(repo.lastWorkout("jason", "cardio")).toEqual(new Date(500));
    expect(repo.lastWorkout("lucia", "strength")).toEqual(new Date(9_000));
    expect(repo.lastWorkout("jason", "focus")).toEqual(new Date(700));
    expect(repo.lastWorkout("lucia", "cardio")).toBeNull();
  });

  it("rejects an unknown character or stat without writing", () => {
    const { repo } = setup();
    expect(() => repo.logWorkout("franklin" as never, "strength")).toThrow(
      InvalidValueError,
    );
    expect(() => repo.logWorkout("jason", "stamina" as never)).toThrow(
      InvalidValueError,
    );
  });
});
