import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./TabBar.module.css";

export type Tab = "story" | "checklist" | "map" | "stats" | "more";

const ICON_PROPS = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const TABS: { id: Tab; label: string; href: string; icon: ReactNode }[] = [
  {
    id: "story",
    label: "Story",
    href: "/",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M5 21V4M5 4h12l-2.5 4L17 12H5" />
      </svg>
    ),
  },
  {
    id: "checklist",
    label: "Checklist",
    href: "/checklist",
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </svg>
    ),
  },
  {
    id: "map",
    label: "Map",
    href: "/map",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M9 4 3 6.5v14L9 18l6 2.5 6-2.5V4l-6 2.5z" />
        <path d="M9 4v14M15 6.5v14" />
      </svg>
    ),
  },
  {
    id: "stats",
    label: "Stats",
    href: "/stats",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M6 20v-7M12 20V5M18 20v-11" />
      </svg>
    ),
  },
  {
    id: "more",
    label: "More",
    href: "/more",
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="6" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="18" cy="12" r="1" />
      </svg>
    ),
  },
];

export function TabBar({ active }: { active: Tab }) {
  return (
    <nav className={styles.bar} aria-label="Main">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={tab.id === active ? styles.active : styles.tab}
          aria-current={tab.id === active ? "page" : undefined}
        >
          {tab.icon}
          <span className={styles.label}>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
