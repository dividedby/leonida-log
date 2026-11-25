import { z } from "zod";

/**
 * Curated data schemas and cross-file validation. Pure: no I/O, safe to import
 * anywhere. Reading the YAML files is lib/curated-load.ts (server only).
 *
 * Mission order is derived from list position in missions.yaml, never stored,
 * so it cannot disagree with the list.
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

const missionsFileSchema = z.strictObject({
  chapters: z.array(z.strictObject({ slug, title: text })).min(1),
  missions: z
    .array(z.strictObject({ slug, title: text, chapter: slug }))
    .min(1),
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
  missions: Mission[];
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

  const { chapters, missions } = missionsFile.data;
  const gates = gatesFile.data.gates;
  const items = itemFiles.flatMap(([, list]) => list);

  const chapterIndex = new Map(chapters.map((c, i) => [c.slug, i]));
  const missionOrder = new Map(missions.map((m, i) => [m.slug, i + 1]));
  const gateOrder = new Map(
    gates.map((g) => [g.mission, missionOrder.get(g.mission)]),
  );

  for (const d of duplicates(chapters.map((c) => c.slug))) {
    issues.push(`missions.yaml: duplicate chapter slug "${d}"`);
  }
  for (const d of duplicates(missions.map((m) => m.slug))) {
    issues.push(`missions.yaml: duplicate mission slug "${d}"`);
  }
  for (const d of duplicates(gates.map((g) => g.mission))) {
    issues.push(`gates.yaml: duplicate gate "${d}"`);
  }
  for (const d of duplicates(items.map((i) => i.id))) {
    issues.push(`items: duplicate item id "${d}"`);
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
    return { ...m, order: i + 1, chapterOrder };
  });
  return {
    chapters: chapters.map((c, i) => ({
      ...c,
      order: i + 1,
      missionCount: chapterOrders.get(c.slug) ?? 0,
    })),
    missions: derivedMissions,
    gates: gates
      .map((g) => ({ ...g, order: missionOrder.get(g.mission) as number }))
      .sort((a, b) => a.order - b.order),
    items,
  };
}
