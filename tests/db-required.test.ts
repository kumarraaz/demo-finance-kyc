import { describe, expect, it } from "vitest";
import { hasTestDb } from "./helpers/test-db";

describe("database tests", () => {
  it.runIf(Boolean(process.env.CI))("CI must provide TEST_DATABASE_URL (database tests may not be skipped in CI)", () => {
    expect(hasTestDb).toBe(true);
  });
  it.skipIf(hasTestDb)("TEST_DATABASE_URL is not set: PostgreSQL tests are being SKIPPED locally", () => {});
});
