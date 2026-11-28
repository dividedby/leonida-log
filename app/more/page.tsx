import Link from "next/link";
import { redirect } from "next/navigation";
import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { TabBar } from "@/components/TabBar/TabBar";
import { moreView } from "@/lib/more";
import { getCurated, getRepository } from "@/lib/server/data";
import { setTheme } from "./actions";
import styles from "./page.module.css";

// Reads the database per request; build has no DATABASE_PATH.
export const dynamic = "force-dynamic";

export default function More() {
  const repo = getRepository();
  const { currentMission, theme } = repo.getProgress();
  if (currentMission === null) redirect("/onboarding");

  const view = moreView(getCurated(), currentMission, theme);

  return (
    <div className={styles.frame}>
      <PostcardHeader title="More" />
      <main className={styles.main}>
        <section aria-labelledby="story-heading">
          <h2 id="story-heading" className={styles.heading}>
            Story position
          </h2>
          <p className={styles.eyebrow}>{view.story.eyebrow}</p>
          <p className={styles.mission}>{view.story.title}</p>
          <p className={styles.muted}>
            Mission {view.story.position.number} of {view.story.position.total}
          </p>
          <Link className={styles.link} href="/onboarding">
            Change story position
          </Link>
        </section>
        {view.research.map((section) => (
          <section key={section.title} className={styles.row}>
            <h2 className={styles.heading}>{section.title}</h2>
            <p className={styles.muted}>{section.status}</p>
          </section>
        ))}
        <section aria-labelledby="settings-heading">
          <h2 id="settings-heading" className={styles.heading}>
            Settings
          </h2>
          <form action={setTheme} className={styles.theme}>
            <span id="theme-label" className={styles.themeLabel}>
              Theme
            </span>
            <div
              className={styles.options}
              role="group"
              aria-labelledby="theme-label"
            >
              {view.theme.map((option) => (
                <button
                  key={option.value}
                  type="submit"
                  name="theme"
                  value={option.value}
                  className={
                    option.selected
                      ? `${styles.option} ${styles.selected}`
                      : styles.option
                  }
                  aria-pressed={option.selected}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </form>
          <p className={styles.muted}>{view.spoilers}</p>
        </section>
      </main>
      <TabBar active="more" />
    </div>
  );
}
