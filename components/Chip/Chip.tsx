import type { ReactNode } from "react";
import styles from "./Chip.module.css";

export type ChipVariant = "soon-lost" | "tip" | "countdown";

const VARIANT_CLASS: Record<ChipVariant, string> = {
  "soon-lost": styles.soonLost,
  tip: styles.tip,
  countdown: styles.countdown,
};

export function Chip({
  variant,
  children,
}: {
  variant: ChipVariant;
  children: ReactNode;
}) {
  return (
    <span className={`${styles.chip} ${VARIANT_CLASS[variant]}`}>
      {children}
    </span>
  );
}
