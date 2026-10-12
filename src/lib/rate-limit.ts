import type { Db } from "./db";

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

/**
 * Shared fixed-window counter stored in Postgres, so the limit holds across
 * serverless instances and restarts. The upsert is a single atomic statement:
 * concurrent requests cannot both read "4" and both write "5".
 *
 * Every call counts as an attempt. Callers decide what to do when the count
 * exceeds `max`, and call resetRateLimit() after a success.
 */
export async function consumeRateLimit(db: Db, key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const windowSeconds = windowMs / 1000;
  const rows = await db.$queryRaw<{ count: number; retry_after: number }[]>`
    INSERT INTO "rate_limits" ("key", "count", "window_start")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limits"."window_start" <= now() - make_interval(secs => ${windowSeconds}::double precision)
                     THEN 1 ELSE "rate_limits"."count" + 1 END,
      "window_start" = CASE WHEN "rate_limits"."window_start" <= now() - make_interval(secs => ${windowSeconds}::double precision)
                            THEN now() ELSE "rate_limits"."window_start" END
    RETURNING "count",
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("window_start" + make_interval(secs => ${windowSeconds}::double precision) - now()))))::int AS retry_after
  `;
  const { count, retry_after } = rows[0];
  return { allowed: count <= max, count, retryAfterSeconds: retry_after };
}

export async function resetRateLimit(db: Db, key: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key } });
}

/** Housekeeping: drop counters whose window ended long ago. */
export async function pruneRateLimits(db: Db, olderThanMs = 24 * 3600 * 1000): Promise<number> {
  const res = await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - olderThanMs) } } });
  return res.count;
}
