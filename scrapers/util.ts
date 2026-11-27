import { createHash } from "node:crypto";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Normalizes a date from a listing or JSON-LD to ISO UTC. Date-only values
 * and values without a zone are read as UTC. Returns undefined when unparsable.
 */
export function toIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  let v = value.trim();
  if (/^\d{4}-\d{2}-\d{2} \d/.test(v)) v = v.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v += "T00:00:00Z";
  else if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) v += "Z";
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

/** True when `a` is strictly later than `b`. Unparsable values count as not later. */
export function isLater(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return !Number.isNaN(ta) && !Number.isNaN(tb) && ta > tb;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
