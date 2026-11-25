import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.frame}>
      <header className={styles.band}>
        <h1 className={styles.title}>Leonida Log</h1>
      </header>
      <main className={styles.main} />
    </div>
  );
}
