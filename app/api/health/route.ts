import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness check for uptime monitors, Docker healthchecks and CI.
 * 200 when the app can reach the database and migrations have been applied; 503 otherwise.
 * Reveals no configuration or data.
 */
export async function GET() {
  const started = Date.now();
  try {
    const r = await pool().query<{ n: number }>(`SELECT count(*)::int AS n FROM schema_migrations`);
    return Response.json(
      { status: "ok", database: "ok", migrations: r.rows[0].n, latencyMs: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "error", database: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
