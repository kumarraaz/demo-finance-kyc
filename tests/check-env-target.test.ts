import { describe, expect, it } from "vitest";
import { checkEnv, migrationBlockers } from "../scripts/check-env.mjs";
import { buildTargetBlockers, migrationTargetBlockers, targetVerificationBlockers } from "../scripts/lib/migration-target.mjs";

// Regression for a review finding: checkEnv only validated EXPECTED_DB_ENDPOINT when migrations were on,
// but vercel-build also verifies it (and FAILS the build on a mismatch) when migrations are off. So
// `npm run check-env -- preview` could report a clean setup that the build then rejected.
// These tests pin that `check-env` reports exactly the target problems the build enforces.

const EXPECTED = "ep-preview-fixture-000001";
const OTHER = "ep-production-fixture-000002";
const url = (endpoint: string, pooled = false) =>
  `postgresql://user:pw-fixture@${endpoint}${pooled ? "-pooler" : ""}.c-7.us-east-2.aws.neon.tech/neondb?sslmode=verify-full`;
const hash = `scrypt$${"a".repeat(32)}$${"b".repeat(128)}`;
const complete = {
  ADMIN_USERNAME: "kumarraaz",
  ADMIN_PASSWORD_HASH: hash,
  SESSION_SECRET: "Xk9".repeat(16) + "abcdefghijklmnop",
};

type Env = Record<string, string | undefined>;
const cases: Array<[string, Env]> = [
  ["verify-only, everything matches", { ...complete, DATABASE_URL: url(EXPECTED, true), DATABASE_URL_UNPOOLED: url(EXPECTED), EXPECTED_DB_ENDPOINT: EXPECTED, RUN_DB_MIGRATIONS: "0" }],
  ["verify-only, RUN_DB_MIGRATIONS unset, matches", { ...complete, DATABASE_URL: url(EXPECTED, true), DATABASE_URL_UNPOOLED: url(EXPECTED), EXPECTED_DB_ENDPOINT: EXPECTED }],
  ["verify-only, direct URL on another endpoint", { ...complete, DATABASE_URL: url(EXPECTED, true), DATABASE_URL_UNPOOLED: url(OTHER), EXPECTED_DB_ENDPOINT: EXPECTED, RUN_DB_MIGRATIONS: "0" }],
  ["verify-only, runtime URL on another endpoint", { ...complete, DATABASE_URL: url(OTHER, true), DATABASE_URL_UNPOOLED: url(EXPECTED), EXPECTED_DB_ENDPOINT: EXPECTED, RUN_DB_MIGRATIONS: "0" }],
  ["verify-only, pooled direct URL", { ...complete, DATABASE_URL: url(EXPECTED, true), DATABASE_URL_UNPOOLED: url(EXPECTED, true), EXPECTED_DB_ENDPOINT: EXPECTED }],
  ["verify-only, no direct URL at all", { ...complete, DATABASE_URL: url(EXPECTED, true), EXPECTED_DB_ENDPOINT: EXPECTED }],
  ["verify-only, DIRECT_URL on another endpoint wins over a good UNPOOLED", { ...complete, DATABASE_URL: url(EXPECTED, true), DIRECT_URL: url(OTHER), DATABASE_URL_UNPOOLED: url(EXPECTED), EXPECTED_DB_ENDPOINT: EXPECTED }],
  ["verify-only, EXPECTED_DB_ENDPOINT is a pasted connection string", { ...complete, DATABASE_URL: url(EXPECTED, true), DATABASE_URL_UNPOOLED: url(EXPECTED), EXPECTED_DB_ENDPOINT: url(EXPECTED) }],
  ["nothing to verify: EXPECTED_DB_ENDPOINT unset, migrations off", { ...complete, DATABASE_URL: url(OTHER, true), DATABASE_URL_UNPOOLED: url(OTHER) }],
  ["migrating, everything matches", { ...complete, DATABASE_URL: url(EXPECTED, true), DATABASE_URL_UNPOOLED: url(EXPECTED), EXPECTED_DB_ENDPOINT: EXPECTED, RUN_DB_MIGRATIONS: "1" }],
  ["migrating, direct URL on another endpoint", { ...complete, DATABASE_URL: url(EXPECTED, true), DATABASE_URL_UNPOOLED: url(OTHER), EXPECTED_DB_ENDPOINT: EXPECTED, RUN_DB_MIGRATIONS: "1" }],
  ["migrating, EXPECTED_DB_ENDPOINT missing", { ...complete, DATABASE_URL: url(EXPECTED, true), DATABASE_URL_UNPOOLED: url(EXPECTED), RUN_DB_MIGRATIONS: "1" }],
];

describe("check-env reports the database-target problems the build enforces", () => {
  it.each(cases)("%s", (_name, env) => {
    const buildProblems = buildTargetBlockers(env);
    const errors = checkEnv(env, "preview").errors;
    // every reason that would fail the build is reported by check-env ...
    for (const reason of buildProblems) expect(errors).toContain(reason);
    // ... and a clean target yields the positive confirmation, never an error about the target.
    if (buildProblems.length === 0 && env.EXPECTED_DB_ENDPOINT?.trim()) {
      expect(checkEnv(env, "preview").ok.join("\n")).toMatch(/EXPECTED_DB_ENDPOINT matches/);
    }
  });

  it("buildTargetBlockers is exactly what the build uses in each mode", () => {
    for (const [, env] of cases) {
      const expected = env.RUN_DB_MIGRATIONS === "1" ? migrationTargetBlockers(env) : targetVerificationBlockers(env);
      expect(buildTargetBlockers(env)).toEqual(expected);
      if (env.RUN_DB_MIGRATIONS === "1") {
        for (const reason of expected) expect(migrationBlockers(env)).toContain(reason);
      }
    }
  });

  it("the exact scenario from the review: a mismatching Preview with migrations off now errors", () => {
    const env = { ...complete, DATABASE_URL: url(EXPECTED, true), DATABASE_URL_UNPOOLED: url(OTHER), EXPECTED_DB_ENDPOINT: EXPECTED, RUN_DB_MIGRATIONS: "0" };
    const r = checkEnv(env, "preview");
    expect(r.errors.join("\n")).toMatch(/Migration target mismatch/);
    expect(r.errors.join("\n")).toContain(OTHER);
  });

  it("does not run migrations or touch a database: it only inspects environment values", () => {
    // checkEnv is a pure function of its argument; calling it twice gives identical output and no I/O is possible here.
    const env = { ...complete, DATABASE_URL: url(EXPECTED, true), DATABASE_URL_UNPOOLED: url(OTHER), EXPECTED_DB_ENDPOINT: EXPECTED };
    expect(checkEnv(env, "preview")).toEqual(checkEnv(env, "preview"));
  });

  it("never prints credentials or full host names in the new reports", () => {
    const env = { ...complete, DATABASE_URL: url(EXPECTED, true), DATABASE_URL_UNPOOLED: url(OTHER), EXPECTED_DB_ENDPOINT: EXPECTED };
    const out = checkEnv(env, "preview").errors.join("\n");
    for (const leak of ["pw-fixture", "user:", "postgresql://", ".neon.tech"]) expect(out).not.toContain(leak);
  });
});
