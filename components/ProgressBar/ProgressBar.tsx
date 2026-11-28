import { progressPercent } from "@/lib/progress";
import styles from "./ProgressBar.module.css";

export function ProgressBar({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  /** Visible caption, e.g. "3 of 6 done"; also names the bar. */
  label?: string;
}) {
  const percent = progressPercent(done, total);
  return (
    <div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label ?? `${done} of ${total} done`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
      {label ? <p className={styles.label}>{label}</p> : null}
    </div>
  );
}
