import { redirect } from "next/navigation";
import { LockedRow } from "@/components/LockedRow/LockedRow";
import { MarkDone } from "@/components/MarkDone/MarkDone";
import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { TabBar } from "@/components/TabBar/TabBar";
import { checklistView } from "@/lib/checklist";
import { doneControl } from "@/lib/done";
import { getCurated, getRepository } from "@/lib/server/data";
import { markMissionDone } from "../actions";
import { SectionRows } from "../SectionRows";
import styles from "./page.module.css";

// Reads the database per request; build has no DATABASE_PATH.
export const dynamic = "force-dynamic";

export default function Checklist() {
  const repo = getRepository();
  const { currentMission } = repo.getProgress();
  if (currentMission === null) redirect("/onboarding");

  const data = getCurated();
  const view = checklistView(data, currentMission, repo.checkedItemIds());

  return (
    <div className={styles.frame}>
      <PostcardHeader
        eyebrow={view.header.eyebrow}
        title={view.header.title}
        subtitle={view.header.subtitle}
      />
      <main className={styles.main}>
        {view.sections.map((section) => (
          <SectionRows key={section.key} section={section} />
        ))}
        {view.locked ? (
          <LockedRow
            count={view.locked.count}
            unlockMission={view.locked.unlockTitle}
          />
        ) : null}
        {view.lost ? (
          <section className={styles.lost} aria-labelledby="lost-heading">
            <h2 id="lost-heading" className={styles.lostHeading}>
              Lost at this point of no return
            </h2>
            <p className={styles.lostLabel}>{view.lost.label}</p>
            <ul className={styles.lostList}>
              {view.lost.entries.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className={styles.actions}>
          <MarkDone
            control={doneControl(data, currentMission)}
            returnTo="/checklist"
            action={markMissionDone}
          />
        </div>
      </main>
      <TabBar active="checklist" />
    </div>
  );
}
