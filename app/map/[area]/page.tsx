import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { TabBar } from "@/components/TabBar/TabBar";
import { areaSheet } from "@/lib/map";
import { getCurated, getRepository } from "@/lib/server/data";
import { SectionRows } from "../../SectionRows";
import styles from "../page.module.css";

// Reads the database per request; build has no DATABASE_PATH.
export const dynamic = "force-dynamic";

/**
 * The sheet for one region or district. A hidden or unknown slug is the same
 * 404, so the route says nothing about areas past the current mission (ADR
 * 0010); the tab title stays the app's default for the same reason.
 */
export default async function AreaScreen({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const { area } = await params;
  const repo = getRepository();
  const { currentMission } = repo.getProgress();
  if (currentMission === null) redirect("/onboarding");

  const sheet = areaSheet(
    getCurated(),
    currentMission,
    repo.checkedItemIds(),
    area,
  );
  if (sheet === null) notFound();

  return (
    <div className={styles.frame}>
      <PostcardHeader
        eyebrow="Map"
        title={sheet.header.name}
        subtitle={sheet.header.subtitle}
      />
      <main className={styles.main}>
        <Link className={styles.back} href="/map">
          Back to map
        </Link>
        {sheet.sections.map((section) => (
          <SectionRows key={section.key} section={section} hideTagFor={area} />
        ))}
      </main>
      <TabBar active="map" />
    </div>
  );
}
