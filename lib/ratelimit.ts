import { q1 } from "./db";

/** Fixed-window limiter backed by Postgres (works across serverless instances). Returns true if allowed. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const row = await q1<{ count: number }>(
    `INSERT INTO rate_limits (key, count, window_end) VALUES ($1, 1, now() + make_interval(secs => $2))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_end < now() THEN 1 ELSE rate_limits.count + 1 END,
       window_end = CASE WHEN rate_limits.window_end < now() THEN now() + make_interval(secs => $2) ELSE rate_limits.window_end END
     RETURNING count`,
    [key, windowSeconds],
  );
  return (row?.count ?? 0) <= limit;
}

export function clientIp(headers: Headers) {
  return (headers.get("x-nf-client-connection-ip") || headers.get("x-forwarded-for")?.split(",")[0] || headers.get("x-real-ip") || "unknown").trim();
}
