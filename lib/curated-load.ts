import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import {
  CuratedValidationError,
  parseCurated,
  type CuratedData,
} from "./curated";

/** Server only: reads from disk. Never import from a client component. */
export const CURATED_DIR = path.join(process.cwd(), "data", "curated");

function readYaml(file: string): unknown {
  try {
    return parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new CuratedValidationError([
      `${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}

export function loadCurated(dir: string = CURATED_DIR): CuratedData {
  const itemsDir = path.join(dir, "items");
  const itemFiles: Record<string, unknown> = {};
  for (const file of readdirSync(itemsDir).filter((f) => f.endsWith(".yaml"))) {
    itemFiles[path.basename(file, ".yaml")] = readYaml(
      path.join(itemsDir, file),
    );
  }
  return parseCurated({
    missions: readYaml(path.join(dir, "missions.yaml")),
    gates: readYaml(path.join(dir, "gates.yaml")),
    areas: readYaml(path.join(dir, "areas.yaml")),
    itemFiles,
  });
}
