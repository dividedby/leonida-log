import Link from "next/link";
import type { DoneControl, DonePage } from "@/lib/done";
import { PrimaryButton } from "../PrimaryButton/PrimaryButton";
import styles from "./MarkDone.module.css";

/**
 * "Mark mission done" for Home and the checklist. An ordinary mission moves on
 * with one tap; a point of no return goes through the `/done` confirmation
 * first. Nothing here names a mission. `action` is the server action taking
 * FormData `from` (the mission's global order) and `return` (`returnTo`).
 */
export function MarkDone({
  control,
  returnTo,
  action,
}: {
  /** Null on the last mission: there is nothing to move on to. */
  control: DoneControl | null;
  returnTo: DonePage;
  action: (formData: FormData) => void | Promise<void>;
}) {
  if (control === null) return null;
  if (control.mode === "confirm") {
    return (
      <Link className={styles.link} href="/done">
        Mark mission done
      </Link>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="from" value={control.from} />
      <input type="hidden" name="return" value={returnTo} />
      <PrimaryButton type="submit">Mark mission done</PrimaryButton>
    </form>
  );
}
