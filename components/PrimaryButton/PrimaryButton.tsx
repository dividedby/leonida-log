import type { ReactNode } from "react";
import styles from "./PrimaryButton.module.css";

export function PrimaryButton({
  children,
  type = "button",
  onClick,
  formAction,
  disabled,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  formAction?: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <button
      className={styles.button}
      type={type}
      onClick={onClick}
      formAction={formAction}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
