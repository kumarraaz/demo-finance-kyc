import { describe, expect, it } from "vitest";
import { migrationBlockers, checkEnv, formatReport } from "../scripts/check-env.mjs";
import { describeDbHost, migrationTargetBlockers, targetVerificationBlockers } from "../scripts/lib/migration-target.mjs";

// Fixture endpoint ids with the same shape as Neon's ("ep-..."). The guard is endpoint-agnostic: it only
// compares the id in the URL with the configured one, so real ids add nothing and are not used here.
const PREVIEW = "ep-preview-fixture-000001";
const PRODUCTION = "ep-production-fixture-000002";
const url = (endpoint: string, { pooled = false, user = "neondb_owner", pw = "s3cretPW" } = {}) =>
  `postgresql://${user}:${pw}@${endpoint}${pooled ? "-pooler" : ""}.c-7.us-east-2.aws.neon.tech/neondb?sslmode=verify-full`;

const base = { RUN_DB_MIGRATIONS: "1", VERCEL_ENV: "preview" };

describe("describeDbHost", () => {
  it("extracts the Neon endpoint id and detects the pooled host", () => {
    expect(describeDbHost(url(PREVIEW))).toMatchObject({ endpointId: PREVIEW, pooled: false });
    expect(describeDbHost(url(PREVIEW, { pooled: true }))).toMatchObject({ endpointId: PREVIEW, pooled: true });
  });
  it("is case-insensitive and returns null for junk", () => {
    expect(describeDbHost("postgresql://u:p@EP-ABC.c-7.neon.tech/db")?.endpointId).toBe("ep-abc");
    expect(describeDbHost("not a url")).toBeNull();
    expect(describeDbHost("")).toBeNull();
  });
});

describe("migration-target guard (RUN_DB_MIGRATIONS=1 must prove which database it changes)", () => {
  it("allows the Preview endpoint when it is the configured one", () => {
    const env = { ...base, DATABASE_URL_UNPOOLED: url(PREVIEW), EXPECTED_DB_ENDPOINT: PREVIEW };
    expect(migrationBlockers(env)).toEqual([]);
  });

  it("REFUSES the Production endpoint, even though a Preview endpoint is configured", () => {
    const env = { ...base, DATABASE_URL_UNPOOLED: url(PRODUCTION), EXPECTED_DB_ENDPOINT: PREVIEW };
    const out = migrationBlockers(env).join("\n");
    expect(out).toMatch(/Migration target mismatch/);
    expect(out).toContain(PRODUCTION);
    expect(out).toContain(PREVIEW);
  });

  it("REFUSES an unknown endpoint", () => {
    const env = { ...base, DATABASE_URL_UNPOOLED: url("ep-something-else-123456"), EXPECTED_DB_ENDPOINT: PREVIEW };
    expect(migrationBlockers(env).join()).toMatch(/mismatch/);
  });

  it("REFUSES when the expected endpoint is not configured (fails closed)", () => {
    for (const blank of [undefined, "", "   "]) {
      const env = { ...base, DATABASE_URL_UNPOOLED: url(PREVIEW), EXPECTED_DB_ENDPOINT: blank };
      expect(migrationBlockers(env).join()).toMatch(/requires EXPECTED_DB_ENDPOINT/);
    }
  });

  it("checks the URL migrations actually use: DIRECT_URL wins over DATABASE_URL_UNPOOLED", () => {
    const env = { ...base, DIRECT_URL: url(PRODUCTION), DATABASE_URL_UNPOOLED: url(PREVIEW), EXPECTED_DB_ENDPOINT: PREVIEW };
    expect(migrationBlockers(env).join()).toMatch(new RegExp(`DIRECT_URL points at endpoint "${PRODUCTION}"`));
  });

  it("is not fooled by the pooled DATABASE_URL pointing at Preview while the direct URL points elsewhere", () => {
    const env = {
      ...base,
      DATABASE_URL: url(PREVIEW, { pooled: true }),
      DATABASE_URL_UNPOOLED: url(PRODUCTION),
      EXPECTED_DB_ENDPOINT: PREVIEW,
    };
    expect(migrationBlockers(env).join()).toMatch(/mismatch/);
  });

  it("refuses a pooled migration host even when it is the right endpoint", () => {
    const env = { ...base, DATABASE_URL_UNPOOLED: url(PREVIEW, { pooled: true }), EXPECTED_DB_ENDPOINT: PREVIEW };
    expect(migrationBlockers(env).join()).toMatch(/POOLED host/);
  });

  it("accepts the full host name as the expected value (non-Neon providers)", () => {
    const env = { ...base, DIRECT_URL: "postgresql://u:p@db.internal.example.com/app", EXPECTED_DB_ENDPOINT: "DB.internal.example.com" };
    expect(migrationBlockers(env)).toEqual([]);
  });

  it("refuses an unparseable migration URL", () => {
    expect(migrationTargetBlockers({ DIRECT_URL: "definitely not a url", EXPECTED_DB_ENDPOINT: PREVIEW }).join()).toMatch(/not a valid URL/);
  });

  it("does nothing when migrations are not enabled", () => {
    expect(migrationBlockers({ DATABASE_URL_UNPOOLED: url(PRODUCTION) })).toEqual([]);
  });

  it("production builds are still refused independently of the endpoint match", () => {
    const env = { RUN_DB_MIGRATIONS: "1", VERCEL_ENV: "production", DATABASE_URL_UNPOOLED: url(PRODUCTION), EXPECTED_DB_ENDPOINT: PRODUCTION };
    expect(migrationBlockers(env).join()).toMatch(/production database/);
  });

  it("never echoes a connection string or password, even if one is pasted into EXPECTED_DB_ENDPOINT", () => {
    const pasted = `postgresql://neondb_owner:hunter2-pw@${PREVIEW}.c-7.us-east-2.aws.neon.tech/neondb`;
    const env = { ...base, DATABASE_URL_UNPOOLED: url(PREVIEW, { pw: "hunter2-pw" }), EXPECTED_DB_ENDPOINT: pasted };
    const out = migrationBlockers(env).join("\n");
    expect(out).toMatch(/not a plain endpoint id/);
    for (const leak of ["hunter2-pw", "neondb_owner", "postgresql://"]) expect(out).not.toContain(leak);

    const mismatch = migrationBlockers({ ...base, DATABASE_URL_UNPOOLED: url(PRODUCTION, { pw: "hunter2-pw" }), EXPECTED_DB_ENDPOINT: PREVIEW }).join("\n");
    for (const leak of ["hunter2-pw", "neondb_owner", "postgresql://", ".neon.tech"]) expect(mismatch).not.toContain(leak);
  });
});

describe("verify-only mode (EXPECTED_DB_ENDPOINT set, migrations off)", () => {
  it("does nothing when EXPECTED_DB_ENDPOINT is not set", () => {
    expect(targetVerificationBlockers({ DATABASE_URL_UNPOOLED: url(PRODUCTION) })).toEqual([]);
  });
  it("passes when both URLs point at the expected endpoint", () => {
    const env = { DATABASE_URL: url(PREVIEW, { pooled: true }), DATABASE_URL_UNPOOLED: url(PREVIEW), EXPECTED_DB_ENDPOINT: PREVIEW };
    expect(targetVerificationBlockers(env)).toEqual([]);
  });
  it("fails when the direct URL points at Production", () => {
    const env = { DATABASE_URL: url(PREVIEW, { pooled: true }), DATABASE_URL_UNPOOLED: url(PRODUCTION), EXPECTED_DB_ENDPOINT: PREVIEW };
    expect(targetVerificationBlockers(env).join()).toMatch(/mismatch/);
  });
  it("fails when the app's pooled DATABASE_URL points at a different endpoint than the direct URL", () => {
    const env = { DATABASE_URL: url(PRODUCTION, { pooled: true }), DATABASE_URL_UNPOOLED: url(PREVIEW), EXPECTED_DB_ENDPOINT: PREVIEW };
    const out = targetVerificationBlockers(env).join();
    expect(out).toMatch(new RegExp(`DATABASE_URL points at endpoint "${PRODUCTION}"`));
  });
  it("fails when there is no direct URL to verify", () => {
    expect(targetVerificationBlockers({ DATABASE_URL: url(PREVIEW, { pooled: true }), EXPECTED_DB_ENDPOINT: PREVIEW }).join()).toMatch(/no direct URL/);
  });
  it("also protects the migrating path from a runtime/migration split", () => {
    const env = { ...base, DATABASE_URL: url(PRODUCTION, { pooled: true }), DATABASE_URL_UNPOOLED: url(PREVIEW), EXPECTED_DB_ENDPOINT: PREVIEW };
    expect(migrationBlockers(env).join()).toMatch(/DATABASE_URL points at endpoint/);
  });
  it("the real build script fails (without migrating) when the target does not match", async () => {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(process.execPath, ["scripts/vercel-build.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 90_000,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        VERCEL_ENV: "preview",
        DATABASE_URL: url(PREVIEW, { pooled: true }),
        DATABASE_URL_UNPOOLED: url(PRODUCTION, { pw: "leakme-pw" }),
        EXPECTED_DB_ENDPOINT: PREVIEW,
      } as unknown as NodeJS.ProcessEnv,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Migration target mismatch/);
    expect(r.stdout + r.stderr).not.toMatch(/Creating an optimized production build/);
    expect(r.stdout + r.stderr).not.toContain("leakme-pw");
  }, 100_000);
});

describe("checkEnv reports the target proof", () => {
  const hash = `scrypt$${"a".repeat(32)}$${"b".repeat(128)}`;
  const env = {
    DATABASE_URL: url(PREVIEW, { pooled: true }),
    DATABASE_URL_UNPOOLED: url(PREVIEW),
    ADMIN_USERNAME: "kumarraaz",
    ADMIN_PASSWORD_HASH: hash,
    SESSION_SECRET: "Xk9".repeat(16) + "abcdefghijklmnop",
    RUN_DB_MIGRATIONS: "1",
    EXPECTED_DB_ENDPOINT: PREVIEW,
  };
  it("is clean for the matching Preview configuration", () => {
    const r = checkEnv(env, "preview");
    expect(r.errors).toEqual([]);
    expect(r.ok.join("\n")).toMatch(/EXPECTED_DB_ENDPOINT matches/);
  });
  it("errors for a Production endpoint and leaks nothing", () => {
    const r = checkEnv({ ...env, DATABASE_URL_UNPOOLED: url(PRODUCTION, { pw: "leakme-pw" }) }, "preview");
    expect(r.errors.join("\n")).toMatch(/mismatch/);
    expect(formatReport(r)).not.toContain("leakme-pw");
  });
  it("errors when migrations are on and no expected endpoint is set", () => {
    const { EXPECTED_DB_ENDPOINT: _x, ...rest } = env;
    void _x;
    expect(checkEnv(rest, "preview").errors.join("\n")).toMatch(/requires EXPECTED_DB_ENDPOINT/);
  });
});

describe("the real build script refuses before touching any database", () => {
  it("vercel-build exits non-zero on a Production endpoint and never reaches migrate or next build", async () => {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(process.execPath, ["scripts/vercel-build.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 90_000,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        VERCEL_ENV: "preview",
        RUN_DB_MIGRATIONS: "1",
        DATABASE_URL_UNPOOLED: url(PRODUCTION, { pw: "leakme-pw" }),
        EXPECTED_DB_ENDPOINT: PREVIEW,
      } as unknown as NodeJS.ProcessEnv,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Migration target mismatch/);
    const all = r.stdout + r.stderr;
    expect(all).not.toMatch(/Applying database migrations/);
    expect(all).not.toMatch(/Creating an optimized production build/);
    expect(all).not.toContain("leakme-pw");
  }, 100_000);
});
