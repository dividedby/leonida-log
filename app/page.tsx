import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.frame}>
      <PostcardHeader title="Leonida Log" />
      <main className={styles.main} />
    </div>
  );
}
