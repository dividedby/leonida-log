"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { missionFromOrder } from "@/lib/picker";
import { getCurated, getRepository } from "@/lib/server/data";

/** Saves the picked mission (global order, never a slug) and goes Home. */
export async function saveStoryPosition(formData: FormData): Promise<void> {
  const raw = formData.get("mission");
  const slug = missionFromOrder(
    getCurated(),
    typeof raw === "string" ? raw : null,
  );
  getRepository().setCurrentMission(slug);
  revalidatePath("/", "layout");
  redirect("/");
}
