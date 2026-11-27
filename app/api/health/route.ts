import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Liveness for the deploy script and the container healthcheck. It proves the
// database opens with its schema, and reports which image is running. A
// failure answers 503 with no error text: the response is not for people.
export function GET(): Response {
  const headers = { "Cache-Control": "no-store" };
  try {
    getDb().get(sql`select 1`);
  } catch {
    return Response.json({ ok: false }, { status: 503, headers });
  }
  return Response.json(
    { ok: true, revision: process.env.APP_REVISION ?? null },
    { headers },
  );
}
