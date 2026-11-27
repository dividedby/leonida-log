import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CuratedData } from "../lib/curated";
import type { SourceStats } from "./run";
import type { ReportRow } from "./store";

export const DEFAULT_REPORT_DIR = path.join("data", "scraped", "reports");

interface DiffSummary {
  headingsAdded?: string[];
  headingsRemoved?: string[];
  paragraphsAdded?: number;
  paragraphsRemoved?: number;
  snippets?: string[];
}

export interface ReportInput {
  rows: ReportRow[];
  curated: CuratedData;
  /** YYYY-MM-DD. */
  since: string;
  generatedAt: Date;
  /** Present for a scrape run; absent for --report-only. */
  stats?: SourceStats[];
}

function table(header: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join(
    "\n",
  );
}

function parseSummary(json: string | null): DiffSummary {
  if (!json) return {};
  try {
    return JSON.parse(json) as DiffSummary;
  } catch {
    return {};
  }
}

function countsSection(input: ReportInput): string {
  if (input.stats) {
    return table(
      [
        "Source",
        "Discovered",
        "Fetched",
        "Unchanged",
        "Changed",
        "New",
        "Baselined",
        "Deferred",
        "Robots-blocked",
        "Errors",
      ],
      input.stats.map((s) => [
        s.name,
        s.discovered,
        s.fetched,
        s.unchanged,
        s.changed,
        s.new,
        s.baselined,
        s.deferred,
        s.blockedByRobots,
        s.errors,
      ]),
    );
  }
  const by = new Map<string, { new: number; modified: number }>();
  for (const r of input.rows) {
    const c = by.get(r.source) ?? { new: 0, modified: 0 };
    if (r.changeKind === "modified") c.modified++;
    else c.new++;
    by.set(r.source, c);
  }
  return [
    "Report only: regenerated from the database, no sources were run.",
    "",
    table(
      ["Source", "New", "Modified"],
      [...by].map(([source, c]) => [source, c.new, c.modified]),
    ),
  ].join("\n");
}

/** Markdown "changed since" report, grouped by gate hint then source. */
export function renderReport(input: ReportInput): string {
  const { curated } = input;
  const titleOf = new Map<string, string>();
  const orderOf = new Map<string, number>();
  for (const m of curated.missions) {
    titleOf.set(m.slug, m.title);
    orderOf.set(m.slug, m.order);
  }
  for (const m of curated.optionalMissions) titleOf.set(m.slug, m.title);
  const label = (slug: string) => {
    const title = titleOf.get(slug) ?? slug;
    const order = orderOf.get(slug);
    return order ? `${title} (#${order})` : `${title} (optional)`;
  };

  const groups = new Map<string, ReportRow[]>();
  for (const r of input.rows) {
    const key = r.gateHint ?? "";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const gateOrder = (key: string) =>
    key === "" ? Number.POSITIVE_INFINITY : (orderOf.get(key) ?? 1e9);

  const out: string[] = [
    `# Changed since ${input.since}`,
    "",
    `Generated ${input.generatedAt.toISOString()} (UTC). Holds short scraped snippets: it stays on the server and is never committed or rendered.`,
    "",
    countsSection(input),
    "",
    `${input.rows.length} changed page${input.rows.length === 1 ? "" : "s"}.`,
  ];

  for (const key of [...groups.keys()].sort(
    (a, b) => gateOrder(a) - gateOrder(b),
  )) {
    out.push("", key === "" ? "## No gate hint" : `## Before ${label(key)}`);
    const rows = groups.get(key)!;
    for (const source of [...new Set(rows.map((r) => r.source))].sort()) {
      out.push("", `### ${source}`);
      for (const r of rows.filter((x) => x.source === source)) {
        const d = parseSummary(r.diffSummary);
        out.push(
          "",
          `- **${r.title ?? r.url}** (${r.changeKind ?? "changed"})`,
          `  - ${r.url}`,
          `  - Remote modified: ${r.remoteModified ?? "unknown"}`,
        );
        if (r.missionHint) {
          out.push(
            `  - Missions: ${r.missionHint.split(",").map(label).join(", ")}`,
          );
        }
        if (r.gateHint) out.push(`  - Gate hint: ${r.gateHint}`);
        if (d.headingsAdded?.length)
          out.push(`  - Headings added: ${d.headingsAdded.join("; ")}`);
        if (d.headingsRemoved?.length)
          out.push(`  - Headings removed: ${d.headingsRemoved.join("; ")}`);
        out.push(
          `  - Paragraphs: +${d.paragraphsAdded ?? 0} / -${d.paragraphsRemoved ?? 0}`,
        );
        for (const s of d.snippets ?? [])
          out.push(`  - > ${s.replace(/\s+/g, " ")}`);
      }
    }
  }
  return `${out.join("\n")}\n`;
}

/** Writes changed-since-<since>.md and a latest.md copy; returns the dated path. */
export function writeReport(
  dir: string,
  since: string,
  markdown: string,
): string {
  mkdirSync(dir, { recursive: true });
  const dated = path.join(dir, `changed-since-${since}.md`);
  writeFileSync(dated, markdown);
  copyFileSync(dated, path.join(dir, "latest.md"));
  return dated;
}
