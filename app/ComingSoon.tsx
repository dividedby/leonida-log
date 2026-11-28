import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { TabBar, type Tab } from "@/components/TabBar/TabBar";
import styles from "./page.module.css";

/** Stand-in for a tab whose screen isn't built yet. Reads no data. */
export function ComingSoon({ title, tab }: { title: string; tab: Tab }) {
  return (
    <div className={styles.frame}>
      <PostcardHeader title={title} />
      <main className={styles.main}>
        <p className={styles.soon}>Coming soon.</p>
      </main>
      <TabBar active={tab} />
    </div>
  );
}
