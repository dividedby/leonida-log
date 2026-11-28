"use client";

import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { PrimaryButton } from "@/components/PrimaryButton/PrimaryButton";
import styles from "./page.module.css";

/** A fixed message: error text can name curated content or paths, so it is never shown. */
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className={styles.frame}>
      <PostcardHeader title="Something went wrong" />
      <main className={styles.main}>
        <p className={styles.soon}>The page could not load. Try again.</p>
        <PrimaryButton onClick={reset}>Try again</PrimaryButton>
      </main>
    </div>
  );
}
