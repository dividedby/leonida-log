"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { advanceTarget, afterMarkDone } from "@/lib/done";
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

/**
 * Moves the current mission one step on. FormData: `from` (the global order
 * the form was rendered for), `return` ("/" or "/checklist"; anything else
 * goes Home) and, to cross a point of no return, `confirmed` ("true", sent only
 * by the /done page). A stale or repeated form changes nothing and goes Home.
 * Errors are generic: they can reach the client.
 */
export async function markMissionDone(formData: FormData): Promise<void> {
  const from = formData.get("from");
  const returnTo = formData.get("return");
  const repo = getRepository();
  const current = repo.getProgress().currentMission;

  let destination = "/";
  if (current !== null) {
    const target = advanceTarget(
      getCurated(),
      current,
      typeof from === "string" ? from : null,
    );
    if (target.action === "advance") {
      if (target.crossesGate && formData.get("confirmed") !== "true") {
        throw new Error("Invalid request");
      }
      repo.setCurrentMission(target.to);
      revalidatePath("/", "layout");
      destination = afterMarkDone(
        target.crossesGate,
        typeof returnTo === "string" ? returnTo : null,
      );
    }
  }
  // Outside any try/catch: redirect works by throwing.
  redirect(destination);
}
