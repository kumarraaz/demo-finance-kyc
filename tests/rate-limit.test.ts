import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consumeRateLimit, pruneRateLimits, resetRateLimit } from "@/lib/rate-limit";
import { createTestDb, hasTestDb, type TestDb } from "./helpers/test-db";

const WINDOW = 60_000;

describe.skipIf(!hasTestDb)("shared rate limiter (PostgreSQL)", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it("allows up to max then blocks, and reports a retry time", async () => {
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await consumeRateLimit(t.db, "k1", 5, WINDOW));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, true, true, false, false]);
    expect(results[6].count).toBe(7);
    expect(results[6].retryAfterSeconds).toBeGreaterThan(0);
    expect(results[6].retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("keys are independent", async () => {
    for (let i = 0; i < 6; i++) await consumeRateLimit(t.db, "busy", 5, WINDOW);
    expect((await consumeRateLimit(t.db, "quiet", 5, WINDOW)).allowed).toBe(true);
  });

  it("is atomic under concurrency: exactly `max` of N parallel attempts are allowed", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => consumeRateLimit(t.db, "race", 5, WINDOW)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(new Set(results.map((r) => r.count)).size).toBe(25);
  });

  it("starts a new window after the old one expires", async () => {
    for (let i = 0; i < 6; i++) await consumeRateLimit(t.db, "expiring", 5, WINDOW);
    expect((await consumeRateLimit(t.db, "expiring", 5, WINDOW)).allowed).toBe(false);
    await t.db.$executeRaw`UPDATE rate_limits SET window_start = now() - interval '2 minutes' WHERE key = 'expiring'`;
    const again = await consumeRateLimit(t.db, "expiring", 5, WINDOW);
    expect(again).toMatchObject({ allowed: true, count: 1 });
  });

  it("reset clears the counter", async () => {
    for (let i = 0; i < 6; i++) await consumeRateLimit(t.db, "resettable", 5, WINDOW);
    await resetRateLimit(t.db, "resettable");
    expect(await consumeRateLimit(t.db, "resettable", 5, WINDOW)).toMatchObject({ allowed: true, count: 1 });
  });

  it("is shared between separate clients (as separate serverless instances would be)", async () => {
    const { createPrismaClient } = await import("@/lib/db");
    const other = createPrismaClient(t.url, { schema: t.schema, maxConnections: 2 });
    try {
      for (let i = 0; i < 3; i++) await consumeRateLimit(t.db, "shared", 5, WINDOW);
      for (let i = 0; i < 2; i++) await consumeRateLimit(other, "shared", 5, WINDOW);
      expect((await consumeRateLimit(t.db, "shared", 5, WINDOW)).allowed).toBe(false);
    } finally {
      await other.$disconnect();
    }
  });

  it("prune removes only old counters", async () => {
    await consumeRateLimit(t.db, "old", 5, WINDOW);
    await consumeRateLimit(t.db, "fresh", 5, WINDOW);
    await t.db.$executeRaw`UPDATE rate_limits SET window_start = now() - interval '3 days' WHERE key = 'old'`;
    expect(await pruneRateLimits(t.db)).toBeGreaterThanOrEqual(1);
    expect(await t.db.rateLimit.findUnique({ where: { key: "old" } })).toBeNull();
    expect(await t.db.rateLimit.findUnique({ where: { key: "fresh" } })).not.toBeNull();
  });

  it("the table rejects a zero count", async () => {
    await expect(t.db.$executeRaw`INSERT INTO rate_limits (key, count, window_start) VALUES ('bad', 0, now())`).rejects.toThrow();
  });
});
