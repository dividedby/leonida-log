"use server";

import { revalidatePath } from "next/cache";
import { parseStatLevelInput } from "@/lib/stats";
import { getRepository } from "@/lib/server/data";

/**
 * Sets one stat to the level a picker button posts. FormData: `character`,
 * `stat` and `level` (0 to 4). Anything else is rejected before any write.
 * Errors are generic: they can reach the client.
 */
export async function setStatLevel(formData: FormData): Promise<void> {
  const input = parseStatLevelInput(formData);
  if (input === null) throw new Error("Invalid request");
  getRepository().setStatLevel(input.character, input.stat, input.level);
  revalidatePath("/stats");
  revalidatePath("/");
}
