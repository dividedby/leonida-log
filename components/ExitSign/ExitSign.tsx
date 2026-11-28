import Link from "next/link";
import styles from "./ExitSign.module.css";

/** The next point of no return. Takes no description: only the gate is named (ADR 0002). */
export function ExitSign({
  exit,
  gateTitle,
  done,
  total,
  href,
}: {
  /** The gate's mission number. */
  exit: number;
  gateTitle: string;
  done: number;
  total: number;
  href?: string;
}) {
  const body = (
    <>
      <span className={styles.badge}>Exit {exit}</span>
      <h2 className={styles.title}>{gateTitle}</h2>
      <span className={styles.meta}>
        Point of no return · {done} of {total} done
      </span>
    </>
  );

  return href ? (
    <Link className={`${styles.sign} ${styles.link}`} href={href}>
      {body}
    </Link>
  ) : (
    <div className={styles.sign}>{body}</div>
  );
}
