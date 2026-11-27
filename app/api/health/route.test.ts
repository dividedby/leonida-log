import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tempDbs } from "@/lib/db/test-helpers";

// The real module throws outside a React server build.
vi.mock("server-only", () => ({}));

import { GET } from "./route";

const dbs = tempDbs();
const globalForDb = globalThis as { __leonidaDb?: { close(): void } };

beforeEach(() => {
  delete process.env.APP_REVISION;
});

afterEach(() => {
  globalForDb.__leonidaDb?.close();
  delete globalForDb.__leonidaDb;
  delete process.env.DATABASE_PATH;
  delete process.env.APP_REVISION;
});

describe("GET /api/health", () => {
  it("answers 200 with the running revision when the database is migrated", async () => {
    process.env.DATABASE_PATH = dbs.fresh();
    process.env.APP_REVISION = "abc123";

    const res = GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, revision: "abc123" });
  });

  it("reports a null revision outside an image build", async () => {
    process.env.DATABASE_PATH = dbs.fresh();

    expect(await GET().json()).toEqual({ ok: true, revision: null });
  });

  it.each([
    ["has no schema", () => dbs.empty()],
    ["is not configured", () => undefined],
  ])("answers 503 with no detail when the database %s", async (_n, setup) => {
    const file = setup();
    if (file) process.env.DATABASE_PATH = file;

    const res = GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
