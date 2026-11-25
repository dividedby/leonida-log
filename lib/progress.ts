/** Whole-number completion percentage, clamped to 0-100. 0 when there is nothing to do. */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  const percent = Math.round((done / total) * 100);
  return Math.min(100, Math.max(0, percent));
}

/** "3/7" style count label. */
export function formatCount(done: number, total: number): string {
  return `${done}/${total}`;
}
