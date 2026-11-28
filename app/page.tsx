import Link from "next/link";
import { redirect } from "next/navigation";
import { Chip } from "@/components/Chip/Chip";
import { ChecklistRow } from "@/components/ChecklistRow/ChecklistRow";
import { ExitSign } from "@/components/ExitSign/ExitSign";
import { MarkDone } from "@/components/MarkDone/MarkDone";
import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { StatStrip } from "@/components/StatStrip/StatStrip";
import { TabBar } from "@/components/TabBar/TabBar";
import { doneControl } from "@/lib/done";
import { homeView } from "@/lib/home";
import { getCurated, getRepository } from "@/lib/server/data";
import { markMissionDone, setItemChecked } from "./actions";
import styles from "./page.module.css";

// Reads the database per request; build has no DATABASE_PATH.
export const dynamic = "force-dynamic";

export default function Home() {
  const repo = getRepository();
  const { currentMission } = repo.getProgress();
  if (currentMission === null) redirect("/onboarding");

  const data = getCurated();
  const checked = repo.checkedItemIds();
  const view = homeView(data, currentMission, checked, repo.getStatLevels());

  return (
    <div className={styles.frame}>
      <PostcardHeader
        eyebrow={view.eyebrow}
        title={view.title}
        subtitle={`Mission ${view.position.number} of ${view.position.total}`}
      />
      <main className={styles.main}>
        {view.gate ? (
          <ExitSign
            exit={view.gate.exit}
            gateTitle={view.gate.title}
            done={view.gate.done}
            total={view.gate.total}
            href="/checklist"
          />
        ) : null}
        <StatStrip rows={view.stats} href="/stats" />
        <div className={styles.headingRow}>
          <h2 className={styles.heading}>Up next</h2>
          <Link className={styles.seeAll} href="/checklist">
            See all
          </Link>
        </div>
        {view.upNext.length === 0 ? (
          <p className={styles.empty}>{view.emptyMessage}</p>
        ) : (
          <div>
            {view.upNext.map((row) => (
              <ChecklistRow
                key={row.id}
                id={row.id}
                label={row.title}
                checked={checked.has(row.id)}
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
          </div>
        )}
        <MarkDone
          control={doneControl(data, currentMission)}
          returnTo="/"
          action={markMissionDone}
        />
        <Link className={styles.link} href="/onboarding">
          Change story position
        </Link>
      </main>
      <TabBar active="story" />
    </div>
  );
}
