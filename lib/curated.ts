import { z } from "zod";

/**
 * Curated data schemas and cross-file validation. Pure: no I/O, safe to import
 * anywhere. Reading the YAML files is lib/curated-load.ts (server only).
 *
 * Mission order is derived from list position among the main missions in
 * missions.yaml, never stored, so it cannot disagree with the list. Optional
 * missions (any other kind) are listed after the mains and carry no order of
 * their own: they open and close relative to main missions.
 */

const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be a kebab-case slug");
const text = z.string().trim().min(1);

export const CATEGORIES = [
  "Stats",
  "Vehicles",
  "Focus",
  "Collectibles",
  "Money",
  "Romance",
  "Criminal profile",
  "Side missions",
  "General",
] as const;

const sourceSchema = z.strictObject({
  url: z.url({ protocol: /^https$/ }),
  title: text,
  accessed: z.iso.date(),
});

const itemSchema = z.strictObject({
  id: slug,
  title: text,
  category: z.enum(CATEGORIES),
  before_gate: slug,
  visible_after_mission: slug,
  lost_at_mission: slug.optional(),
  verified: z.boolean(),
  how_to: text,
  location: text.optional(),
  sources: z.array(sourceSchema).min(1),
});

const itemsFileSchema = z.strictObject({ items: z.array(itemSchema) });

export const MISSION_KINDS = [
  "main",
  "optional",
  "strangers-and-freaks",
  "hourglass",
  "side-job",
] as const;
export const CHARACTERS = ["jason", "lucia", "both"] as const;

/** Fields only a non-main mission carries; a main mission must not set them. */
const OPTIONAL_ONLY_FIELDS = [
  "character",
  "opens_after",
  "closes_at",
  "sources",
  "note",
] as const;
/** Of those, the ones a non-main mission must set. */
const OPTIONAL_REQUIRED_FIELDS = [
  "character",
  "opens_after",
  "closes_at",
  "sources",
] as const;

const missionSchema = z
  .strictObject({
    slug: slug.refine((s) => s !== "never", 'slug "never" is reserved'),
    title: text,
    chapter: slug,
    kind: z.enum(MISSION_KINDS).default("main"),
    character: z.enum(CHARACTERS).optional(),
    opens_after: slug.optional(),
    closes_at: slug.optional(),
    sources: z.array(sourceSchema).min(1).optional(),
    note: text.optional(),
  })
  .superRefine((m, ctx) => {
    const fields = m.kind === "main" ? OPTIONAL_ONLY_FIELDS : [];
    for (const field of fields) {
      if (m[field] !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `must not be set on a main mission`,
        });
      }
    }
    if (m.kind !== "main") {
      for (const field of OPTIONAL_REQUIRED_FIELDS) {
        if (m[field] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `is required for kind "${m.kind}"`,
          });
        }
      }
    }
  });

const missionsFileSchema = z.strictObject({
  chapters: z.array(z.strictObject({ slug, title: text })).min(1),
  missions: z.array(missionSchema).min(1),
});

const gatesFileSchema = z.strictObject({
  gates: z.array(
    z.strictObject({
      mission: slug,
      lost: z.array(text).min(1),
      sources: z.array(sourceSchema).min(1),
    }),
  ),
});

export type Source = z.infer<typeof sourceSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Category = (typeof CATEGORIES)[number];
export type MissionKind = (typeof MISSION_KINDS)[number];
export type Character = (typeof CHARACTERS)[number];

export interface Chapter {
  slug: string;
  title: string;
  /** 1-based position in the story. */
  order: number;
  missionCount: number;
}

export interface Mission {
  slug: string;
  title: string;
  chapter: string;
  /** 1-based position across the whole game. */
  order: number;
  /** 1-based position inside its chapter. */
  chapterOrder: number;
}

/**
 * A mission that is not on the story path: it opens after `opensAnchor` (a
 * main mission, resolved through any chain of optionals) and closes when the
 * story reaches `closesAt`, or never.
 */
export interface OptionalMission {
  slug: string;
  title: string;
  kind: Exclude<MissionKind, "main">;
  chapter: string;
  character: Character;
  note?: string;
  sources: Source[];
  /** The main mission the opens_after chain ends at. */
  opensAnchor: string;
  /** Global order of `opensAnchor`. */
  opensOrder: number;
  /** A main mission slug, or "never". */
  closesAt: string;
  /** Global order of `closesAt`; null for "never". */
  closesOrder: number | null;
}

/** A point of no return, keyed by the mission that triggers it. */
export interface Gate {
  mission: string;
  /** Global order of `mission`. */
  order: number;
  lost: string[];
  sources: Source[];
}

export interface CuratedData {
  chapters: Chapter[];
  /** Main missions only: the story path and everything the picker offers. */
  missions: Mission[];
  /** Sorted by opensOrder, then file order. */
  optionalMissions: OptionalMission[];
  /** Sorted by order. */
  gates: Gate[];
  items: Item[];
}

/** Parsed-but-unvalidated file contents, keyed the way the loader reads them. */
export interface CuratedRaw {
  missions: unknown;
  gates: unknown;
  /** Keyed by file name without extension (`items/<key>.yaml`). */
  itemFiles: Record<string, unknown>;
}

export class CuratedValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid curated data (${issues.length}):\n- ${issues.join("\n- ")}`);
    this.name = "CuratedValidationError";
    this.issues = issues;
  }
}

function schemaIssues(file: string, error: z.ZodError): string[] {
  return error.issues.map((i) => {
    const path = i.path.length > 0 ? `${i.path.join(".")}: ` : "";
    return `${file}: ${path}${i.message}`;
  });
}

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
}

/**
 * Validates every file, then the rules that span files, and returns the data
 * with derived order. Throws one CuratedValidationError listing every issue.
 */
export function parseCurated(raw: CuratedRaw): CuratedData {
  const issues: string[] = [];

  const missionsFile = missionsFileSchema.safeParse(raw.missions);
  if (!missionsFile.success) {
    issues.push(...schemaIssues("missions.yaml", missionsFile.error));
  }
  const gatesFile = gatesFileSchema.safeParse(raw.gates);
  if (!gatesFile.success) {
    issues.push(...schemaIssues("gates.yaml", gatesFile.error));
  }
  const itemFiles: [string, Item[]][] = [];
  for (const [name, content] of Object.entries(raw.itemFiles).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const file = `items/${name}.yaml`;
    const parsed = itemsFileSchema.safeParse(content);
    if (parsed.success) itemFiles.push([name, parsed.data.items]);
    else issues.push(...schemaIssues(file, parsed.error));
  }
  if (!missionsFile.success || !gatesFile.success || issues.length > 0) {
    throw new CuratedValidationError(issues);
  }

  const { chapters } = missionsFile.data;
  const allMissions = missionsFile.data.missions;
  const missions = allMissions.filter((m) => m.kind === "main");
  const optionals = allMissions.filter((m) => m.kind !== "main");
  const gates = gatesFile.data.gates;
  const items = itemFiles.flatMap(([, list]) => list);

  const chapterIndex = new Map(chapters.map((c, i) => [c.slug, i]));
  const missionOrder = new Map(missions.map((m, i) => [m.slug, i + 1]));
  const optionalBySlug = new Map(optionals.map((m) => [m.slug, m]));
  const gateOrder = new Map(
    gates.map((g) => [g.mission, missionOrder.get(g.mission)]),
  );

  for (const d of duplicates(chapters.map((c) => c.slug))) {
    issues.push(`missions.yaml: duplicate chapter slug "${d}"`);
  }
  for (const d of duplicates(allMissions.map((m) => m.slug))) {
    issues.push(`missions.yaml: duplicate mission slug "${d}"`);
  }
  for (const d of duplicates(gates.map((g) => g.mission))) {
    issues.push(`gates.yaml: duplicate gate "${d}"`);
  }
  for (const d of duplicates(items.map((i) => i.id))) {
    issues.push(`items: duplicate item id "${d}"`);
  }
  // item_checks stores item ids and optional mission slugs under one key.
  const missionSlugs = new Set(allMissions.map((m) => m.slug));
  for (const item of items) {
    if (missionSlugs.has(item.id)) {
      issues.push(`items: item id "${item.id}" is also a mission slug`);
    }
  }

  let previousChapter = -1;
  for (const m of missions) {
    const index = chapterIndex.get(m.chapter);
    if (index === undefined) {
      issues.push(
        `missions.yaml: mission "${m.slug}" has unknown chapter "${m.chapter}"`,
      );
      continue;
    }
    if (index < previousChapter) {
      issues.push(
        `missions.yaml: mission "${m.slug}" is out of chapter order (chapter "${m.chapter}" must be contiguous and in chapter order)`,
      );
    }
    previousChapter = Math.max(previousChapter, index);
  }
  for (const o of optionals) {
    if (!chapterIndex.has(o.chapter)) {
      issues.push(
        `missions.yaml: mission "${o.slug}" has unknown chapter "${o.chapter}"`,
      );
    }
  }
  for (const c of chapters) {
    if (!missions.some((m) => m.chapter === c.slug)) {
      issues.push(`missions.yaml: chapter "${c.slug}" has no missions`);
    }
  }

  for (const g of gates) {
    if (!missionOrder.has(g.mission)) {
      issues.push(`gates.yaml: gate mission "${g.mission}" is not a mission`);
    }
  }

  const lastGateOrder = Math.max(
    0,
    ...gates.map((g) => missionOrder.get(g.mission) ?? 0),
  );
  const resolved = new Map<
    string,
    { anchor: string; closesOrder: number | null }
  >();
  for (const o of optionals) {
    const where = `missions.yaml: optional mission "${o.slug}"`;
    const closesAt = o.closes_at as string;
    let closesOrder: number | null = null;
    let closesValid = true;
    if (closesAt !== "never") {
      closesOrder = missionOrder.get(closesAt) ?? null;
      if (closesOrder === null) {
        closesValid = false;
        issues.push(
          optionalBySlug.has(closesAt)
            ? `${where} has closes_at "${closesAt}" which is an optional mission; it must be a main mission or "never"`
            : `${where} has unknown closes_at "${closesAt}"`,
        );
      } else if (closesOrder > lastGateOrder) {
        issues.push(
          `${where} has closes_at "${closesAt}" which is after the last gate; add a gate or use "never"`,
        );
      }
    }

    let next = o.opens_after as string;
    const seen = new Set([o.slug]);
    let anchor: string | null = null;
    for (;;) {
      if (missionOrder.has(next)) {
        anchor = next;
        break;
      }
      const link = optionalBySlug.get(next);
      if (!link) {
        issues.push(`${where} has unknown opens_after "${next}"`);
        break;
      }
      if (seen.has(link.slug)) {
        issues.push(`${where} has an opens_after cycle (via "${link.slug}")`);
        break;
      }
      seen.add(link.slug);
      next = link.opens_after as string;
    }
    if (anchor === null) continue;
    const anchorOrder = missionOrder.get(anchor) as number;
    if (closesValid && closesOrder !== null && anchorOrder > closesOrder) {
      issues.push(
        `${where} has opens_after "${o.opens_after}" which is later than closes_at "${closesAt}"`,
      );
    }
    resolved.set(o.slug, { anchor, closesOrder });
  }

  for (const [name, list] of itemFiles) {
    for (const item of list) {
      const where = `items/${name}.yaml: item "${item.id}"`;
      if (item.before_gate !== name) {
        issues.push(
          `${where} has before_gate "${item.before_gate}"; items in this file must use "${name}"`,
        );
      }
      if (!gateOrder.has(item.before_gate)) {
        issues.push(
          `${where} has before_gate "${item.before_gate}" which is not a gate`,
        );
      }
      const visible = missionOrder.get(item.visible_after_mission);
      if (visible === undefined) {
        issues.push(
          `${where} has unknown visible_after_mission "${item.visible_after_mission}"`,
        );
      }
      const lost =
        item.lost_at_mission === undefined
          ? undefined
          : missionOrder.get(item.lost_at_mission);
      if (item.lost_at_mission !== undefined && lost === undefined) {
        issues.push(
          `${where} has unknown lost_at_mission "${item.lost_at_mission}"`,
        );
      }
      const gate = gateOrder.get(item.before_gate);
      if (visible !== undefined && lost !== undefined && lost < visible) {
        issues.push(
          `${where} is lost before it becomes visible (lost_at_mission < visible_after_mission)`,
        );
      }
      if (visible !== undefined && gate !== undefined && visible > gate) {
        issues.push(
          `${where} becomes visible after its gate (visible_after_mission > gate)`,
        );
      }
      if (lost !== undefined && gate !== undefined && lost > gate) {
        issues.push(`${where} is lost after its gate (lost_at_mission > gate)`);
      }
    }
  }

  if (issues.length > 0) throw new CuratedValidationError(issues);

  const chapterOrders = new Map<string, number>();
  const derivedMissions: Mission[] = missions.map((m, i) => {
    const chapterOrder = (chapterOrders.get(m.chapter) ?? 0) + 1;
    chapterOrders.set(m.chapter, chapterOrder);
    return {
      slug: m.slug,
      title: m.title,
      chapter: m.chapter,
      order: i + 1,
      chapterOrder,
    };
  });
  const derivedOptionals: OptionalMission[] = optionals
    .map((o) => {
      const { anchor, closesOrder } = resolved.get(o.slug) as {
        anchor: string;
        closesOrder: number | null;
      };
      return {
        slug: o.slug,
        title: o.title,
        kind: o.kind as OptionalMission["kind"],
        chapter: o.chapter,
        character: o.character as Character,
        ...(o.note === undefined ? {} : { note: o.note }),
        sources: o.sources as Source[],
        opensAnchor: anchor,
        opensOrder: missionOrder.get(anchor) as number,
        closesAt: o.closes_at as string,
        closesOrder,
      };
    })
    .sort((a, b) => a.opensOrder - b.opensOrder);
  return {
    chapters: chapters.map((c, i) => ({
      ...c,
      order: i + 1,
      missionCount: chapterOrders.get(c.slug) ?? 0,
    })),
    missions: derivedMissions,
    optionalMissions: derivedOptionals,
    gates: gates
      .map((g) => ({ ...g, order: missionOrder.get(g.mission) as number }))
      .sort((a, b) => a.order - b.order),
    items,
  };
}
