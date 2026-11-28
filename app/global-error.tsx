"use client";

import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { PrimaryButton } from "@/components/PrimaryButton/PrimaryButton";
import "./globals.css";
import styles from "./page.module.css";

/**
 * Replaces the root layout when it fails (it reads the theme from the
 * database), so it renders its own `<html>`. A fixed message, never the error
 * text; the theme is unknown here, so the OS preference applies.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <div className={styles.frame}>
          <PostcardHeader title="Something went wrong" />
          <main className={styles.main}>
            <p className={styles.soon}>The page could not load. Try again.</p>
            <PrimaryButton onClick={reset}>Try again</PrimaryButton>
          </main>
        </div>
      </body>
    </html>
  );
}
