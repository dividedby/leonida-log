import { CategoryHeader } from "@/components/CategoryHeader/CategoryHeader";
import { ChecklistRow } from "@/components/ChecklistRow/ChecklistRow";
import { Chip } from "@/components/Chip/Chip";
import type { ChecklistSection } from "@/lib/checklist";
import { setItemChecked } from "./actions";

/**
 * One checklist section: CategoryHeader and its ChecklistRows, shared by the
 * checklist and the map screens. `hideTagFor` is the slug
 * of the area a sheet is for: its rows need no tag, rows from a district or
 * elsewhere keep theirs.
 */
export function SectionRows({
  section,
  hideTagFor,
}: {
  section: ChecklistSection;
  hideTagFor?: string;
}) {
  return (
    <section aria-label={section.title}>
      <CategoryHeader
        title={section.title}
        done={section.done}
        total={section.total}
      />
      {section.rows.map((row) => (
        <ChecklistRow
          key={row.id}
          id={row.id}
          label={row.title}
          checked={row.checked}
          disabled={row.disabled}
          href={row.href}
          action={setItemChecked}
          tag={
            row.area && row.area.slug !== hideTagFor ? row.area.name : undefined
          }
          chips={
            row.chips.length > 0
              ? row.chips.map((chip) => (
                  <Chip key={chip.variant} variant={chip.variant}>
                    {chip.text}
                  </Chip>
                ))
              : undefined
          }
        />
      ))}
    </section>
  );
}
