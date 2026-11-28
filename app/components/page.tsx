import type { Metadata } from "next";
import { CategoryHeader } from "@/components/CategoryHeader/CategoryHeader";
import { Chip } from "@/components/Chip/Chip";
import { ExitSign } from "@/components/ExitSign/ExitSign";
import { LockedRow } from "@/components/LockedRow/LockedRow";
import { PostcardHeader } from "@/components/PostcardHeader/PostcardHeader";
import { PrimaryButton } from "@/components/PrimaryButton/PrimaryButton";
import { ProgressBar } from "@/components/ProgressBar/ProgressBar";
import { Schematic } from "@/components/Schematic/Schematic";
import { StatRing } from "@/components/StatRing/StatRing";
import { StatStrip } from "@/components/StatStrip/StatStrip";
import { TabBar } from "@/components/TabBar/TabBar";
import { countdownLabel } from "@/lib/gates";
import type { MapRegion } from "@/lib/map";
import { ChecklistDemo } from "./ChecklistDemo";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Components · Leonida Log",
  robots: { index: false, follow: false },
};

const JASON = {
  name: "Jason",
  stats: [
    { label: "Strength", level: 3 },
    { label: "Cardio", level: 1 },
    { label: "Focus", level: 1 },
  ],
};
const LUCIA = {
  name: "Lucia",
  stats: [
    { label: "Strength", level: 2 },
    { label: "Cardio", level: 2 },
    { label: "Focus", level: 0 },
  ],
};

// Two regions reached, one with nothing left; the other four unreached.
const SCHEMATIC_REGIONS: MapRegion[] = [
  {
    reached: true,
    index: 0,
    name: "Vice City",
    href: "/map/vice-city",
    badge: 0,
  },
  {
    reached: true,
    index: 1,
    name: "Leonida Keys",
    href: "/map/leonida-keys",
    badge: 3,
  },
  { reached: false, index: 2 },
  { reached: false, index: 3 },
  { reached: false, index: 4 },
  { reached: false, index: 5 },
];

function Specimen({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.specimen}>
      <h2 className={styles.name}>{name}</h2>
      {children}
    </section>
  );
}

/** Every component, once. data-theme on the wrapper forces its theme. */
function Column({ theme }: { theme: "light" | "dark" }) {
  return (
    <div className={styles.column} data-theme={theme}>
      <p className={styles.caption}>{theme === "light" ? "Light" : "Dark"}</p>

      <Specimen name="PostcardHeader">
        <div className={styles.bleed}>
          <PostcardHeader
            eyebrow="Before you move on"
            title="Tourist Trap"
            subtitle="3 of 6 done"
            level={2}
          />
        </div>
      </Specimen>

      <Specimen name="ExitSign">
        <ExitSign exit={20} gateTitle="Tourist Trap" done={3} total={6} />
      </Specimen>

      <Specimen name="StatStrip">
        <StatStrip rows={[JASON, LUCIA]} />
      </Specimen>

      <Specimen name="StatRing">
        <div className={styles.rings}>
          <StatRing level={3} label="Strength" />
          <StatRing level={1} label="Cardio" />
          <StatRing level={0} label="Focus" />
        </div>
      </Specimen>

      <Specimen name="CategoryHeader">
        <CategoryHeader title="Vehicles" done={0} total={1} />
      </Specimen>

      <Specimen name="ChecklistRow">
        <ChecklistDemo
          rows={[
            {
              id: `${theme}-weights`,
              label: "Use Jason's back-deck gym while you have it",
              checked: true,
            },
            {
              id: `${theme}-cars`,
              label: "Drive the Ultimate Edition cars",
              checked: false,
              chips: <Chip variant="soon-lost">Soon lost</Chip>,
              tag: "Vice City",
            },
            {
              id: `${theme}-cash`,
              label: "Check what cash carries into Chapter 2",
              checked: false,
              chips: (
                <Chip variant="countdown">
                  {countdownLabel({ state: "open", missions: 3 })}
                </Chip>
              ),
            },
          ]}
        />
      </Specimen>

      <Specimen name="Chip">
        <div className={styles.chips}>
          <Chip variant="soon-lost">Soon lost</Chip>
          <Chip variant="tip">Tip</Chip>
          <Chip variant="countdown">
            {countdownLabel({ state: "open", missions: 3 })}
          </Chip>
        </div>
      </Specimen>

      <Specimen name="LockedRow">
        <LockedRow count={4} unlockMission="Day Release" />
      </Specimen>

      <Specimen name="ProgressBar">
        <ProgressBar done={3} total={6} label="3 of 6 done" />
      </Specimen>

      <Specimen name="PrimaryButton">
        <PrimaryButton>Mark mission done</PrimaryButton>
      </Specimen>

      <Specimen name="Schematic">
        <Schematic regions={SCHEMATIC_REGIONS} />
      </Specimen>

      <Specimen name="TabBar">
        <TabBar active="map" />
      </Specimen>
    </div>
  );
}

export default function ComponentsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Components</h1>
      <p className={styles.lede}>
        Every component at 375px, light on the left and dark on the right. Each
        column forces its theme with data-theme.
      </p>
      <div className={styles.columns}>
        <Column theme="light" />
        <Column theme="dark" />
      </div>
    </main>
  );
}
