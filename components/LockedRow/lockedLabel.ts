/** "4 more unlock after Day Release"; one reads "1 more unlocks after ...". */
export function lockedLabel(count: number, unlockMission: string): string {
  return `${count} more ${count === 1 ? "unlocks" : "unlock"} after ${unlockMission}`;
}
