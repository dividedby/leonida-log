import { desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../lib/db/open";
import { candidates, sources, type ChangeKind } from "../lib/db/schema";

/** Never-fetched baseline rows carry this fetched_at (the column is not null). */
export const NEVER_FETCHED = new Date(0);

/** What the writers need; a Drizzle transaction satisfies it too. */
export type Conn = Pick<Db, "select" | "insert" | "update" | "delete">;

export interface TrackedPage {
  id: number;
  url: string;
  etag: string | null;
  lastModified: string | null;
  remoteModified: string | null;
  contentHash: string | null;
  checkedAt: Date | null;
}

export interface PagePatch {
  title?: string | null;
  etag?: string | null;
  lastModified?: string | null;
  remoteModified?: string | null;
  contentHash?: string | null;
  httpStatus?: number | null;
  fetchedAt?: Date;
  checkedAt?: Date;
  changedAt?: Date;
  extract?: string | null;
}

export interface NewCandidate {
  sourceRowId: number;
  gateHint: string | null;
  categoryHint?: string | null;
  missionHint: string | null;
  changeKind: ChangeKind;
  contentHash: string;
  diffSummary: string;
  rawExtract: string;
  createdAt: Date;
}

export function countTracked(db: Conn, source: string): number {
  return db
    .select({ n: sql<number>`count(*)` })
    .from(sources)
    .where(eq(sources.source, source))
    .get()!.n;
}

/** Tracked pages of one source by URL, without the stored extract text. */
export function loadTracked(
  db: Conn,
  source: string,
): Map<string, TrackedPage> {
  const rows = db
    .select({
      id: sources.id,
      url: sources.url,
      etag: sources.etag,
      lastModified: sources.lastModified,
      remoteModified: sources.remoteModified,
      contentHash: sources.contentHash,
      checkedAt: sources.checkedAt,
    })
    .from(sources)
    .where(eq(sources.source, source))
    .all();
  return new Map(rows.map((r) => [r.url, r]));
}

/** Deletes every tracked page of a source id; its candidates cascade. Works for ids no longer in the registry. */
export function purgeSource(
  db: Conn,
  source: string,
): { pages: number; candidates: number } {
  const pages = countTracked(db, source);
  const cands = db
    .select({ n: sql<number>`count(*)` })
    .from(candidates)
    .innerJoin(sources, eq(candidates.sourceId, sources.id))
    .where(eq(sources.source, source))
    .get()!.n;
  db.delete(sources).where(eq(sources.source, source)).run();
  return { pages, candidates: cands };
}

export function loadExtract(db: Conn, rowId: number): string | null {
  return (
    db
      .select({ extract: sources.extract })
      .from(sources)
      .where(eq(sources.id, rowId))
      .get()?.extract ?? null
  );
}

/** Inserts the page (first sighting) and returns its row id. */
export function insertPage(
  db: Conn,
  page: { source: string; url: string; host: string } & PagePatch,
): number {
  return db
    .insert(sources)
    .values({
      source: page.source,
      url: page.url,
      host: page.host,
      title: page.title,
      etag: page.etag,
      lastModified: page.lastModified,
      remoteModified: page.remoteModified,
      contentHash: page.contentHash,
      httpStatus: page.httpStatus,
      fetchedAt: page.fetchedAt ?? NEVER_FETCHED,
      checkedAt: page.checkedAt,
      changedAt: page.changedAt,
      extract: page.extract,
    })
    .returning({ id: sources.id })
    .get().id;
}

export function updatePage(db: Conn, id: number, patch: PagePatch): void {
  // Undefined keys are skipped by drizzle, so a patch only touches what it names.
  db.update(sources).set(patch).where(eq(sources.id, id)).run();
}

export function insertCandidate(db: Conn, c: NewCandidate): void {
  db.insert(candidates)
    .values({
      sourceId: c.sourceRowId,
      gateHint: c.gateHint,
      categoryHint: c.categoryHint,
      missionHint: c.missionHint,
      changeKind: c.changeKind,
      contentHash: c.contentHash,
      diffSummary: c.diffSummary,
      rawExtract: c.rawExtract,
      createdAt: c.createdAt,
    })
    .run();
}

export interface ReportRow {
  candidateId: number;
  source: string;
  url: string;
  title: string | null;
  remoteModified: string | null;
  changeKind: ChangeKind | null;
  gateHint: string | null;
  missionHint: string | null;
  diffSummary: string | null;
  createdAt: Date;
}

export function candidatesSince(db: Conn, since: Date): ReportRow[] {
  return db
    .select({
      candidateId: candidates.id,
      source: sources.source,
      url: sources.url,
      title: sources.title,
      remoteModified: sources.remoteModified,
      changeKind: candidates.changeKind,
      gateHint: candidates.gateHint,
      missionHint: candidates.missionHint,
      diffSummary: candidates.diffSummary,
      createdAt: candidates.createdAt,
    })
    .from(candidates)
    .innerJoin(sources, eq(candidates.sourceId, sources.id))
    .where(gte(candidates.createdAt, since))
    .orderBy(desc(candidates.createdAt), desc(candidates.id))
    .all();
}
