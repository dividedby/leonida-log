import Link from "next/link";
import { StatRing } from "@/components/StatRing/StatRing";
import { clampLevel } from "@/lib/stat-level";
import styles from "./StatStrip.module.css";

export interface StatStripRow {
  name: string;
  stats: { label: string; level: number }[];
}

export function StatStrip({
  rows,
  href,
}: {
  rows: StatStripRow[];
  /** Makes the whole strip a link, e.g. through to Stats. */
  href?: string;
}) {
  const body = rows.map((row) => (
    <div className={styles.row} key={row.name}>
      <span className={styles.name}>{row.name}</span>
      {row.stats.map((stat) => (
        <span className={styles.mini} key={stat.label}>
          <StatRing level={stat.level} label={stat.label} size="sm" />
          <span aria-hidden="true">
            {stat.label.slice(0, 3)}{" "}
            <b className={styles.level}>{clampLevel(stat.level)}</b>
          </span>
        </span>
      ))}
    </div>
  ));

  return href ? (
    <Link className={`${styles.strip} ${styles.link}`} href={href}>
      {body}
    </Link>
  ) : (
    <div className={styles.strip}>{body}</div>
  );
}
