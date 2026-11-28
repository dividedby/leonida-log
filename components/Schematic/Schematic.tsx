import Link from "next/link";
import type { MapRegion } from "@/lib/map";
import styles from "./Schematic.module.css";

interface Shape {
  /** Test-only: pins the shape to its area in areas.yaml. Never rendered. */
  slug: string;
  d: string;
  /** Name anchor; the badge sits 13 units below it unless `badge` says. */
  label: { x: number; y: number };
  badge?: { x: number; y: number };
  /** A transparent rect so a scattered shape is one tap target. */
  hit?: { x: number; y: number; width: number; height: number };
}

/**
 * Hand-drawn coastline, not to scale and not traced from any map. One shape
 * per top-level area, indexed by `MapRegion.index`, which is the area's
 * position in areas.yaml; a new region goes at the end of both lists.
 */
const SHAPES: Shape[] = [
  {
    slug: "vice-city",
    d: "M168 114 L218 112 L212 176 L186 204 L158 188 Z",
    label: { x: 190, y: 152 },
  },
  {
    slug: "leonida-keys",
    d: "M150 214c4-3 10-3 12 0s-2 6-8 6-7-3-4-6z M126 224c5-3 13-3 15 0s-3 6-10 6-9-3-5-6z M100 234c6-3 15-3 17 0s-3 7-11 7-10-4-6-7z M74 245c6-3 14-3 16 0s-3 6-10 6-10-3-6-6z M52 256c5-2 11-2 13 0s-2 5-8 5-8-2-5-5z",
    label: { x: 132, y: 262 },
    badge: { x: 186, y: 218 },
    hit: { x: 40, y: 206, width: 132, height: 62 },
  },
  {
    slug: "grassrivers",
    d: "M58 136 L104 128 L106 116 L168 114 L158 188 L112 198 L80 168 Z",
    label: { x: 120, y: 158 },
  },
  {
    slug: "port-gellhorn",
    d: "M34 64 L110 60 L104 128 L58 136 L26 98 Z",
    label: { x: 68, y: 100 },
  },
  {
    slug: "ambrosia",
    d: "M110 60 L224 56 L218 112 L106 116 Z",
    label: { x: 164, y: 88 },
  },
  {
    slug: "mount-kalaga",
    d: "M40 16 L206 8 L224 56 L34 64 Z",
    label: { x: 128, y: 38 },
  },
];

/** The area slug each shape stands for, in order; for the test only. */
export const SHAPE_SLUGS = SHAPES.map((s) => s.slug);

function Region({ region, shape }: { region: MapRegion; shape: Shape }) {
  if (!region.reached) {
    // An unreached region is a bare shape: no name, link, count or title.
    return <path className={styles.lk} d={shape.d} aria-hidden="true" />;
  }
  const badge = shape.badge ?? { x: shape.label.x, y: shape.label.y + 13 };
  return (
    <Link
      className={styles.link}
      href={region.href}
      aria-label={
        region.badge > 0 ? `${region.name}, ${region.badge} to do` : region.name
      }
    >
      {shape.hit ? <rect {...shape.hit} fill="transparent" /> : null}
      <path className={styles.rg} d={shape.d} />
      <text
        className={styles.nm}
        x={shape.label.x}
        y={shape.label.y}
        textAnchor="middle"
      >
        {region.name}
      </text>
      {region.badge > 0 ? (
        <>
          <circle className={styles.bg} cx={badge.x} cy={badge.y} r={8} />
          <text
            className={styles.bn}
            x={badge.x}
            y={badge.y + 3.2}
            textAnchor="middle"
          >
            {region.badge}
          </text>
        </>
      ) : null}
    </Link>
  );
}

/**
 * The Map screen's schematic: one shape per region, in the order of
 * `regions`. A reached region is a link to its sheet with its name and a
 * count of what's left; an unreached one is a plain shape that says nothing
 * about the region (ADR 0010).
 */
export function Schematic({ regions }: { regions: MapRegion[] }) {
  return (
    <svg
      className={styles.schem}
      viewBox="0 0 250 276"
      role="group"
      aria-label="Map of Leonida"
    >
      <rect className={styles.sea} width="250" height="276" rx="12" />
      {regions.map((region) => {
        const shape = SHAPES[region.index];
        if (!shape) {
          throw new Error(`No schematic shape for region ${region.index}`);
        }
        return <Region key={region.index} region={region} shape={shape} />;
      })}
    </svg>
  );
}
