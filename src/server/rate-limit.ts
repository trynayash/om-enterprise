import "server-only";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";

/**
 * Fixed-window rate limiter stored in Postgres, so it works across multiple app
 * instances / serverless functions. Returns the current count in the window.
 */
export async function hitRateLimit(key: string, windowSeconds: number): Promise<number> {
  const db = getDb();
  const res = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   THEN now() ELSE rate_limits.window_start END
    RETURNING count`);
  // Opportunistic cleanup (~1% of calls)
  if (Math.random() < 0.01) {
    await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`);
  }
  return Number(res.rows[0]?.count ?? 0);
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message?: string) {
  const count = await hitRateLimit(key, windowSeconds);
  if (count > limit) {
    throw new AppError("RATE_LIMITED", message ?? "Too many attempts. Please wait a few minutes and try again.");
  }
}

/** Keyed hash of an IP so raw addresses aren't stored for public submissions. */
export function hashIp(ip: string): string {
  const secret = process.env.APP_SECRET ?? "dev-secret";
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}
