import Link from "next/link";
import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { PrimaryButton } from "@/components/PrimaryButton/PrimaryButton";
import { pickerView } from "@/lib/picker";
import { getCurated, getRepository } from "@/lib/server/data";
import { saveStoryPosition } from "./actions";
import styles from "./page.module.css";

// Reads the database per request; build has no DATABASE_PATH.
export const dynamic = "force-dynamic";

/** A whole number from a query value, else undefined. */
function numberParam(value: string | string[] | undefined): number | undefined {
  return typeof value === "string" && /^[0-9]+$/.test(value)
    ? Number(value)
    : undefined;
}

/**
 * Story position picker: chapter, then mission. Plain GET links, no client
 * JS. Chapters and missions are addressed by number only (slugs spell
 * titles), and a title shows only for the selected mission (ADR 0002). Also
 * serves as the "Change story position" screen once a mission is saved.
 */
export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { currentMission } = getRepository().getProgress();
  const view = pickerView(getCurated(), currentMission, {
    chapter: numberParam(params.chapter),
    mission: numberParam(params.mission),
  });

  return (
    <div className={styles.frame}>
      {view.step === "chapter" ? (
        <>
          <PostcardHeader
            title="Where are you?"
            subtitle="Pick your chapter, then your mission."
          />
          <main className={styles.main}>
            <nav aria-label="Chapters">
              <ul className={styles.list}>
                {view.chapters.map((chapter) => (
                  <li key={chapter.order}>
                    <Link
                      className={styles.row}
                      href={`/onboarding?chapter=${chapter.order}`}
                    >
                      {chapter.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            {currentMission !== null ? (
              <Link className={styles.link} href="/">
                Cancel
              </Link>
            ) : null}
          </main>
        </>
      ) : (
        <>
          <PostcardHeader
            eyebrow={view.chapter.label}
            title="Which mission?"
            subtitle="Missions are listed by number."
          />
          <main className={styles.main}>
            <ul className={styles.list}>
              {view.missions.map((mission) => (
                <li key={mission.order}>
                  {mission.selected && view.selected ? (
                    <form
                      className={styles.selected}
                      action={saveStoryPosition}
                    >
                      <input
                        type="hidden"
                        name="mission"
                        value={view.selected.order}
                      />
                      <p className={styles.selectedTitle}>
                        <span className={styles.number}>
                          {view.selected.number}
                        </span>
                        {view.selected.title}
                      </p>
                      <PrimaryButton type="submit">
                        I&apos;m on this mission
                      </PrimaryButton>
                    </form>
                  ) : (
                    <Link
                      className={styles.row}
                      href={`/onboarding?chapter=${view.chapter.order}&mission=${mission.order}`}
                    >
                      Mission {mission.number}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <Link className={styles.link} href="/onboarding">
              Back to chapters
            </Link>
            {currentMission !== null ? (
              <Link className={styles.link} href="/">
                Cancel
              </Link>
            ) : null}
          </main>
        </>
      )}
    </div>
  );
}
