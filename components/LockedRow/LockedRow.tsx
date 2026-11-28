import { lockedLabel } from "./lockedLabel";
import styles from "./LockedRow.module.css";

export function LockedRow({
  count,
  unlockMission,
}: {
  count: number;
  unlockMission: string;
}) {
  return (
    <div className={styles.row}>
      <svg
        className={styles.lock}
        width="12"
        height="14"
        viewBox="0 0 12 14"
        aria-hidden="true"
      >
        <rect
          x="1"
          y="6"
          width="10"
          height="7"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
      <span>{lockedLabel(count, unlockMission)}</span>
    </div>
  );
}
