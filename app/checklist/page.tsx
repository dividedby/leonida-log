import { redirect } from "next/navigation";
import { CategoryHeader } from "@/components/CategoryHeader/CategoryHeader";
import { Chip } from "@/components/Chip/Chip";
import { ChecklistRow } from "@/components/ChecklistRow/ChecklistRow";
import { LockedRow } from "@/components/LockedRow/LockedRow";
import { MarkDone } from "@/components/MarkDone/MarkDone";
import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { TabBar } from "@/components/TabBar/TabBar";
import { checklistView } from "@/lib/checklist";
import { doneControl } from "@/lib/done";
import { getCurated, getRepository } from "@/lib/server/data";
import { markMissionDone, setItemChecked } from "../actions";
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
          <section key={section.key} aria-label={section.title}>
            <CategoryHeader
              title={section.title}
              done={section.done}
              total={section.total}
            />
            {section.rows.map((row) => (
              <ChecklistRow
                key={row.id}
                id={row.id}
                label={row.title}
                checked={row.checked}
                disabled={row.disabled}
                href={row.href}
                action={setItemChecked}
                tag={row.area?.name}
                chips={
                  row.chips.length > 0
                    ? row.chips.map((chip) => (
                        <Chip key={chip.variant} variant={chip.variant}>
                          {chip.text}
                        </Chip>
                      ))
                    : undefined
                }
              />
            ))}
          </section>
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
