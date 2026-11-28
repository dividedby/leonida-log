"use server";

import { revalidatePath } from "next/cache";
import { isTickable } from "@/lib/gates";
import { getCurated, getRepository } from "@/lib/server/data";

/**
 * Ticks or unticks a row. Takes the FormData ChecklistRow submits: `id` and
 * `checked` ("true" or "false"). Errors are generic: they can reach the client.
 */
export async function setItemChecked(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const checked = formData.get("checked");
  if (typeof id !== "string" || (checked !== "true" && checked !== "false")) {
    throw new Error("Invalid request");
  }
  const repo = getRepository();
  const current = repo.getProgress().currentMission;
  if (current === null || !isTickable(getCurated(), id, current)) {
    throw new Error("Invalid request");
  }
  repo.setItemChecked(id, checked === "true");
  revalidatePath("/");
  revalidatePath("/checklist");
}
