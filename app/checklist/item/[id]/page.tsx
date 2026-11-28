import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Chip } from "@/components/Chip/Chip";
import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { TabBar } from "@/components/TabBar/TabBar";
import { itemDetail } from "@/lib/checklist";
import { chipsFor } from "@/lib/home";
import { getCurated, getRepository } from "@/lib/server/data";
import styles from "./page.module.css";

// Reads the database per request; build has no DATABASE_PATH.
export const dynamic = "force-dynamic";

const CHARACTER_LABEL = {
  jason: "Jason",
  lucia: "Lucia",
  both: "Jason and Lucia",
} as const;

/**
 * Detail sheet for one checklist row. The id is an item id or an opened
 * optional mission's slug; anything hidden or unknown is the same 404, so the
 * route says nothing about content past the current mission (ADR 0002). The
 * tab title stays the app's default for the same reason.
 */
export default async function ItemDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { currentMission } = getRepository().getProgress();
  if (currentMission === null) redirect("/onboarding");

  const detail = itemDetail(getCurated(), id, currentMission);
  if (detail === null) notFound();

  const chips = chipsFor(detail.closes);

  return (
    <div className={styles.frame}>
      <PostcardHeader
        eyebrow={detail.kind === "item" ? detail.category : "Optional mission"}
        title={detail.title}
      />
      <main className={styles.main}>
        <Link className={styles.back} href="/checklist">
          Back to checklist
        </Link>
        {detail.area ? (
          <p className={styles.area}>
            Area:{" "}
            <Link className={styles.areaLink} href={`/map/${detail.area.slug}`}>
              {detail.area.name}
            </Link>
          </p>
        ) : null}
        {chips.length > 0 ? (
          <div className={styles.chips}>
            {chips.map((chip) => (
              <Chip key={chip.variant} variant={chip.variant}>
                {chip.text}
              </Chip>
            ))}
          </div>
        ) : null}
        {detail.closes.state === "closed" ? (
          <p className={styles.closed}>No longer available.</p>
        ) : null}
        {detail.kind === "item" ? (
          <>
            <section>
              <h2 className={styles.heading}>How to</h2>
              <p className={styles.text}>{detail.howTo}</p>
            </section>
            {detail.location ? (
              <section>
                <h2 className={styles.heading}>Where</h2>
                <p className={styles.text}>{detail.location}</p>
              </section>
            ) : null}
          </>
        ) : (
          <section>
            <h2 className={styles.heading}>
              {CHARACTER_LABEL[detail.character]}
            </h2>
            {detail.note ? <p className={styles.text}>{detail.note}</p> : null}
          </section>
        )}
        {detail.sources.length > 0 ? (
          <section>
            <h2 className={styles.heading}>Sources</h2>
            <ul className={styles.sources}>
              {detail.sources.map((source) => (
                <li key={source.url}>
                  <a
                    className={styles.source}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <TabBar active="checklist" />
    </div>
  );
}
