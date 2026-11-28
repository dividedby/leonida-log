import { formatCount } from "@/lib/progress";
import styles from "./CategoryHeader.module.css";

export function CategoryHeader({
  title,
  done,
  total,
}: {
  title: string;
  done: number;
  total: number;
}) {
  return (
    <div className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      <span className={styles.count}>{formatCount(done, total)}</span>
    </div>
  );
}
