import "server-only";
import { loadCurated } from "../curated-load";
import type { CuratedData } from "../curated";
import { getDb } from "../db/client";
import { createRepository, type Repository } from "../db/repository";

// Survives Next dev HMR, which re-evaluates modules. Curated data is read
// once per process: a YAML change needs a restart (a deploy replaces it).
const globalForData = globalThis as {
  __leonidaCurated?: CuratedData;
  __leonidaRepository?: Repository;
};

export function getCurated(): CuratedData {
  return (globalForData.__leonidaCurated ??= loadCurated());
}

export function getRepository(): Repository {
  return (globalForData.__leonidaRepository ??= createRepository(
    getDb(),
    getCurated(),
  ));
}
