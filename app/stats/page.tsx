import { Chip } from "@/components/Chip/Chip";
import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { StatRing } from "@/components/StatRing/StatRing";
import { TabBar } from "@/components/TabBar/TabBar";
import { getRepository } from "@/lib/server/data";
import { MAX_STAT_LEVEL } from "@/lib/stat-level";
import { statsView } from "@/lib/stats";
import { setStatLevel } from "./actions";
import styles from "./page.module.css";

// Reads the database per request; build has no DATABASE_PATH.
export const dynamic = "force-dynamic";

/**
 * Levels are set by hand (ADR 0009). Tapping a ring opens its 0-4 picker, a
 * native `<details>` with one form per level, so it needs no client JS. A
 * level change gives the `<details>` a new key, which closes it again.
 */
export default function Stats() {
  const cards = statsView(getRepository().getStatLevels());

  return (
    <div className={styles.frame}>
      <PostcardHeader
        title="Stats"
        subtitle={`Max level is ${MAX_STAT_LEVEL}`}
      />
      <main className={styles.main}>
        {cards.map((card) => (
          <section
            key={card.character}
            className={styles.card}
            aria-labelledby={`${card.character}-heading`}
          >
            <h2 id={`${card.character}-heading`} className={styles.name}>
              {card.name}
            </h2>
            <div className={styles.rings}>
              {card.stats.map((stat) => (
                <details key={`${stat.stat}-${stat.level}`} name="stat-picker">
                  <summary
                    className={styles.summary}
                    aria-label={`${stat.label} for ${card.name}, level ${stat.level} of ${MAX_STAT_LEVEL}. Change`}
                  >
                    {/* The summary's label names the ring; hide it from a second reading. */}
                    <span aria-hidden="true">
                      <StatRing level={stat.level} label={stat.label} />
                    </span>
                  </summary>
                  <div className={styles.picker}>
                    {stat.options.map((option) => (
                      <form key={option.level} action={setStatLevel}>
                        <input
                          type="hidden"
                          name="character"
                          value={card.character}
                        />
                        <input type="hidden" name="stat" value={stat.stat} />
                        <input
                          type="hidden"
                          name="level"
                          value={option.level}
                        />
                        <button
                          type="submit"
                          className={
                            option.current
                              ? `${styles.level} ${styles.current}`
                              : styles.level
                          }
                          aria-pressed={option.current}
                          aria-label={`Set ${stat.label} for ${card.name} to ${option.level}`}
                        >
                          {option.level}
                        </button>
                      </form>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
        <p className={styles.tip}>
          <Chip variant="tip">Tip</Chip>
          Strength and Cardio can slip. Focus levels stay.
        </p>
      </main>
      <TabBar active="stats" />
    </div>
  );
}
