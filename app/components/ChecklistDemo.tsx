"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChecklistRow } from "@/components/ChecklistRow/ChecklistRow";

/** Showcase only: keeps toggled state locally so the rows stay toggled. */
export function ChecklistDemo({
  rows,
}: {
  rows: { id: string; label: string; checked: boolean; chips?: ReactNode }[];
}) {
  const [checked, setChecked] = useState(
    () => new Map(rows.map((row) => [row.id, row.checked])),
  );
  return (
    <>
      {rows.map((row) => (
        <ChecklistRow
          key={row.id}
          id={row.id}
          label={row.label}
          checked={checked.get(row.id) ?? false}
          chips={row.chips}
          onToggle={(id, next) =>
            setChecked((current) => new Map(current).set(id, next))
          }
        />
      ))}
    </>
  );
}
