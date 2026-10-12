import { describe, expect, it } from "vitest";
import { hasTestDb, withPgClient } from "./helpers/test-db";

// In CI (or when REQUIRE_DB_TESTS=1) the PostgreSQL tests are mandatory. A missing
// or unreachable database must FAIL the run, never silently skip it.
const required = Boolean(process.env.CI || process.env.REQUIRE_DB_TESTS);

describe("PostgreSQL test database", () => {
  it(required ? "is configured (required here)" : "is configured (optional locally)", () => {
    // Locally, without a database, the PostgreSQL suites show up as "skipped" in the summary.
    if (!hasTestDb && !required) return;
    expect(hasTestDb, "TEST_DATABASE_URL must be set in CI / when REQUIRE_DB_TESTS=1").toBe(true);
  });

  it("is reachable and is PostgreSQL", async () => {
    if (!hasTestDb) return; // covered by the test above
    const version = await withPgClient(async (c) => (await c.query("select version() as v")).rows[0].v as string);
    expect(version).toMatch(/^PostgreSQL \d+/);
  });
});
