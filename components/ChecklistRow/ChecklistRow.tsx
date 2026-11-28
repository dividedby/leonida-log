"use client";

import { useOptimistic, useRef } from "react";
import type { ChangeEvent, ReactNode } from "react";
import styles from "./ChecklistRow.module.css";

/**
 * A real checkbox in a label. Toggling submits the form: `action` receives
 * FormData with `id` and `checked` ("true" or "false", the new state), so a
 * server action can be bound without changing this component. The box flips
 * at once and settles on the `checked` prop when the action finishes.
 */
export function ChecklistRow({
  id,
  label,
  checked,
  action,
  onToggle,
  chips,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  action?: (formData: FormData) => void | Promise<void>;
  onToggle?: (id: string, next: boolean) => void;
  chips?: ReactNode;
  disabled?: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    checked,
    (_current, next: boolean) => next,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const checkedField = useRef<HTMLInputElement>(null);

  async function submit(formData: FormData) {
    const next = formData.get("checked") === "true";
    setOptimistic(next);
    onToggle?.(id, next);
    await action?.(formData);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (checkedField.current) {
      checkedField.current.value = String(event.currentTarget.checked);
    }
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={submit}>
      <input type="hidden" name="id" value={id} />
      <input
        ref={checkedField}
        type="hidden"
        name="checked"
        defaultValue={String(!checked)}
      />
      <label className={styles.row}>
        <span className={styles.control}>
          <input
            className={styles.input}
            type="checkbox"
            checked={optimistic}
            disabled={disabled}
            onChange={handleChange}
          />
          <span className={styles.box} aria-hidden="true" />
        </span>
        <span className={styles.label}>{label}</span>
        {chips ? <span className={styles.chips}>{chips}</span> : null}
      </label>
    </form>
  );
}
