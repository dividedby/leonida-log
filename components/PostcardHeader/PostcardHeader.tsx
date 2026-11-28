import type { ReactNode } from "react";
import styles from "./PostcardHeader.module.css";

export function PostcardHeader({
  eyebrow,
  title,
  subtitle,
  badge,
  level = 1,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Shown above the eyebrow, e.g. an exit badge. */
  badge?: ReactNode;
  /** Heading level: 1 for a screen's own title. */
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className={styles.band}>
      <span className={styles.sun} aria-hidden="true" />
      <span className={styles.sea} aria-hidden="true" />
      <div className={styles.text}>
        {badge ? <div className={styles.badge}>{badge}</div> : null}
        {eyebrow ? <p className={styles.small}>{eyebrow}</p> : null}
        <Heading className={styles.title}>{title}</Heading>
        {subtitle ? <p className={styles.small}>{subtitle}</p> : null}
      </div>
    </header>
  );
}
