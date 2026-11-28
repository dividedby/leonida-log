import Link from "next/link";
import { redirect } from "next/navigation";
import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { PrimaryButton } from "@/components/PrimaryButton/PrimaryButton";
import { TabBar } from "@/components/TabBar/TabBar";
import { doneControl, doneView, untickedCopy } from "@/lib/done";
import { getCurated, getRepository } from "@/lib/server/data";
import { markMissionDone } from "../actions";
import styles from "./page.module.css";

// Reads the database per request; build has no DATABASE_PATH.
export const dynamic = "force-dynamic";

/**
 * Confirmation before moving on from a point of no return. Names only the
 * current mission (reached). The gate's lost list shows here even after the
 * checklist hides it: the last chance to see it. Not a gate: back Home.
 */
export default function Done() {
  const repo = getRepository();
  const { currentMission } = repo.getProgress();
  if (currentMission === null) redirect("/onboarding");

  const data = getCurated();
  const view = doneView(data, currentMission, repo.checkedItemIds());
  const control = doneControl(data, currentMission);
  if (!view.isGate || control === null) redirect("/");

  return (
    <div className={styles.frame}>
      <PostcardHeader eyebrow="Point of no return" title={view.title} />
      <main className={styles.main}>
        <p className={styles.lead}>
          {view.title} is a point of no return. Moving on can&apos;t be undone
          in the game.
        </p>
        <section aria-labelledby="lost-heading">
          <h2 id="lost-heading" className={styles.heading}>
            You lose
          </h2>
          <ul className={styles.list}>
            {view.lost.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </section>
        <p className={styles.unticked}>{untickedCopy(view.unticked)}</p>
        <form action={markMissionDone} className={styles.actions}>
          <input type="hidden" name="from" value={control.from} />
          <input type="hidden" name="confirmed" value="true" />
          <PrimaryButton type="submit">Mark done and move on</PrimaryButton>
          <Link className={styles.cancel} href="/">
            Cancel
          </Link>
        </form>
      </main>
      <TabBar active="story" />
    </div>
  );
}
