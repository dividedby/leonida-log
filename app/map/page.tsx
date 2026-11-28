import { redirect } from "next/navigation";
import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { Schematic } from "@/components/Schematic/Schematic";
import { TabBar } from "@/components/TabBar/TabBar";
import { mapView } from "@/lib/map";
import { getCurated, getRepository } from "@/lib/server/data";
import { SectionRows } from "../SectionRows";
import styles from "./page.module.css";

// Reads the database per request; build has no DATABASE_PATH.
export const dynamic = "force-dynamic";

export default function MapScreen() {
  const repo = getRepository();
  const { currentMission } = repo.getProgress();
  if (currentMission === null) redirect("/onboarding");

  const view = mapView(getCurated(), currentMission, repo.checkedItemIds());

  return (
    <div className={styles.frame}>
      <PostcardHeader
        eyebrow={view.header.eyebrow}
        title={view.header.title}
        subtitle="Tap an area to see what's there"
      />
      <main className={styles.main}>
        <Schematic regions={view.regions} />
        {view.anywhere ? <SectionRows section={view.anywhere} /> : null}
      </main>
      <TabBar active="map" />
    </div>
  );
}
