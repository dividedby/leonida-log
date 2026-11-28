"use server";

import { revalidatePath } from "next/cache";
import { parseTheme } from "@/lib/settings";
import { getRepository } from "@/lib/server/data";

/**
 * Saves the theme a settings button posts. FormData: `theme` (`system`,
 * `light` or `dark`). Anything else is rejected before any write. Errors are
 * generic: they can reach the client.
 */
export async function setTheme(formData: FormData): Promise<void> {
  const theme = parseTheme(formData);
  if (theme === null) throw new Error("Invalid request");
  getRepository().setTheme(theme);
  // The root layout reads the theme, so every page re-renders.
  revalidatePath("/", "layout");
}
