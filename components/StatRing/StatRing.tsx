import { MAX_STAT_LEVEL, clampLevel, ringDash } from "@/lib/stat-level";
import styles from "./StatRing.module.css";

const SIZES = {
  md: { box: 42, radius: 17, stroke: 5 },
  sm: { box: 22, radius: 8, stroke: 3 },
} as const;

export function StatRing({
  level,
  label,
  size = "md",
}: {
  level: number;
  label: string;
  size?: "md" | "sm";
}) {
  const value = clampLevel(level);
  const { box, radius, stroke } = SIZES[size];
  const center = box / 2;
  const circumference = 2 * Math.PI * radius;
  const ring = (
    <svg
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      role="img"
      aria-label={`${label}, level ${value} of ${MAX_STAT_LEVEL}`}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--rule)"
        strokeWidth={stroke}
      />
      {value > 0 ? (
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--pink)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${ringDash(value, circumference)} ${circumference}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      ) : null}
      {size === "md" ? (
        <text
          x={center}
          y={center + 4.5}
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="var(--ink)"
        >
          {value}
        </text>
      ) : null}
    </svg>
  );

  if (size === "sm") return ring;
  return (
    <span className={styles.ring}>
      {ring}
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
