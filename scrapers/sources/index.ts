import type { SourceModule } from "../types";
import { game8jp } from "./game8jp";
import { gamewith } from "./gamewith";
import { gtabase } from "./gtabase";
import { ign } from "./ign";
import { keengamer } from "./keengamer";
import { powerpyx } from "./powerpyx";
import { vandal } from "./vandal";

/** In rank order: earlier sources run first. */
export const SOURCES: SourceModule[] = [
  powerpyx,
  gtabase,
  ign,
  keengamer,
  game8jp,
  gamewith,
  vandal,
];
