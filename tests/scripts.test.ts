import { describe, expect, it } from "vitest";
import { ACCEPTED, evaluateAudit } from "../scripts/audit-gate.mjs";
import { evaluateReport } from "../scripts/assert-no-skips.mjs";
import { checkEnv, formatReport, migrationBlockers } from "../scripts/check-env.mjs";
import { checkPageHeaders, checkSessionCookie } from "../scripts/smoke-deployment.mjs";
import { DIRECT_URL_VARS, resolveDirectUrl, resolveMigrationUrl } from "../scripts/lib/direct-url.mjs";

describe("assert-no-skips (CI gate)", () => {
  it("passes a clean report", () => {
    expect(evaluateReport({ numTotalTests: 10, numPendingTests: 0, numTodoTests: 0, numFailedTests: 0 })).toEqual([]);
  });
  it("fails on skipped, todo, failed or empty runs", () => {
    expect(evaluateReport({ numTotalTests: 10, numPendingTests: 3 })).toEqual(["3 test(s) were skipped"]);
    expect(evaluateReport({ numTotalTests: 10, numTodoTests: 1 })[0]).toMatch(/todo/);
    expect(evaluateReport({ numTotalTests: 10, numFailedTests: 2 })[0]).toMatch(/failed/);
    expect(evaluateReport({ numTotalTests: 0 })[0]).toMatch(/no tests/);
    expect(evaluateReport(null)[0]).toMatch(/no tests/);
  });
});

const advisory = (id: string, title = "t") => ({ source: 1, title, url: `https://github.com/advisories/${id}`, severity: "high" });
const known = {
  braces: { severity: "high", via: [advisory("GHSA-vfj7-8cjw-p6xm")] },
  micromatch: { severity: "high", via: ["braces"] },
  "fast-glob": { severity: "high", via: ["micromatch"] },
  "@next/eslint-plugin-next": { severity: "high", via: ["fast-glob"] },
  "eslint-config-next": { severity: "high", via: ["@next/eslint-plugin-next"] },
};

describe("audit gate", () => {
  it("accepts exactly the documented dev-tool advisories when production is clean", () => {
    const r = evaluateAudit({ vulnerabilities: known }, { vulnerabilities: {} });
    expect(r.failures).toEqual([]);
  });
  it("accepts a fully clean audit and notes stale allow-list entries", () => {
    const r = evaluateAudit({ vulnerabilities: {} }, { vulnerabilities: {} });
    expect(r.failures).toEqual([]);
    expect(r.notes.length).toBe(Object.keys(ACCEPTED).length);
  });
  it("fails on any high advisory in production dependencies", () => {
    const r = evaluateAudit({ vulnerabilities: known }, { vulnerabilities: { prisma: { severity: "high", via: [] } } });
    expect(r.failures.join()).toMatch(/PRODUCTION dependency prisma/);
  });
  it("fails on a package that is not accepted", () => {
    const r = evaluateAudit({ vulnerabilities: { ...known, lodash: { severity: "moderate", via: [advisory("GHSA-xxxx-yyyy-zzzz")] } } }, { vulnerabilities: {} });
    expect(r.failures.join()).toMatch(/lodash/);
  });
  it("fails when an accepted package gets a NEW advisory", () => {
    const worse = { ...known, braces: { severity: "high", via: [advisory("GHSA-vfj7-8cjw-p6xm"), advisory("GHSA-new1-new1-new1", "new problem")] } };
    expect(evaluateAudit({ vulnerabilities: worse }, { vulnerabilities: {} }).failures.join()).toMatch(/NEW advisory GHSA-new1-new1-new1/);
  });
  it("fails when an accepted package is reached through an unaccepted one", () => {
    const via = { ...known, micromatch: { severity: "high", via: ["braces", "evil-pkg"] } };
    expect(evaluateAudit({ vulnerabilities: via }, { vulnerabilities: {} }).failures.join()).toMatch(/evil-pkg/);
  });
  it("only accepts packages that are dev tooling (never prisma, next, pg or react)", () => {
    for (const forbidden of ["prisma", "@prisma/client", "next", "pg", "react", "zod", "@vercel/functions"]) {
      expect(Object.keys(ACCEPTED)).not.toContain(forbidden);
    }
  });
});

const goodHash = `scrypt$${"a".repeat(32)}$${"b".repeat(128)}`;
const good = {
  DATABASE_URL: "postgresql://u:p@ep-x-pooler.example.com/db?sslmode=verify-full",
  DIRECT_URL: "postgresql://u:p@ep-x.example.com/db?sslmode=verify-full",
  ADMIN_USERNAME: "ops-admin",
  ADMIN_PASSWORD_HASH: goodHash,
  SESSION_SECRET: "Xk9".repeat(16) + "abcdefghijklmnop",
  RUN_DB_MIGRATIONS: "1",
  EXPECTED_DB_ENDPOINT: "ep-x",
};

describe("environment checker", () => {
  it("a correct Preview configuration has no errors or warnings", () => {
    const r = checkEnv(good, "preview");
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
  it("an empty environment reports every required variable and never throws", () => {
    const r = checkEnv({}, "preview");
    expect(r.errors.join("\n")).toMatch(/DATABASE_URL[\s\S]*ADMIN_USERNAME[\s\S]*ADMIN_PASSWORD_HASH[\s\S]*SESSION_SECRET/);
  });
  it("explains a hash that was truncated by '$' expansion in an .env loader", () => {
    const r = checkEnv({ ...good, ADMIN_PASSWORD_HASH: "scrypt" }, "preview");
    expect(r.errors.join("\n")).toMatch(/truncated[\s\S]*\$/);
  });
  it("rejects a malformed password hash, a short secret and a non-postgres URL", () => {
    const r = checkEnv({ ...good, ADMIN_PASSWORD_HASH: "plaintext-password", SESSION_SECRET: "short", DATABASE_URL: "mysql://u:p@h/db" }, "preview");
    expect(r.errors.join("\n")).toMatch(/scrypt/);
    expect(r.errors.join("\n")).toMatch(/shorter than 32/);
    expect(r.errors.join("\n")).toMatch(/must start with postgresql/);
  });
  it("requires TLS for remote databases but not for localhost", () => {
    expect(checkEnv({ ...good, DATABASE_URL: "postgresql://u:p@db.example.com/x" }, "preview").errors.join()).toMatch(/sslmode/);
    expect(checkEnv({ ...good, DATABASE_URL: "postgresql://u:p@db.example.com/x?sslmode=disable" }, "preview").errors.join()).toMatch(/sslmode/);
    expect(checkEnv({ ...good, DATABASE_URL: "postgresql://u:p@localhost:5432/x", DIRECT_URL: "postgresql://u:p@localhost:5432/x", EXPECTED_DB_ENDPOINT: "localhost" }, "local").errors).toEqual([]);
  });
  it("warns about sslmode=require (pg v9 will weaken it) and pooled migration URLs", () => {
    const r = checkEnv({ ...good, DATABASE_URL: good.DATABASE_URL.replace("verify-full", "require"), DIRECT_URL: "postgresql://u:p@ep-x-pooler.example.com/db?sslmode=verify-full" }, "preview");
    expect(r.warnings.join("\n")).toMatch(/sslmode=require/);
    expect(r.warnings.join("\n")).toMatch(/POOLED/);
  });
  it("requires DIRECT_URL when migrations are enabled", () => {
    const { DIRECT_URL: _unused, ...rest } = good;
    void _unused;
    expect(checkEnv(rest, "preview").errors.join()).toMatch(/DIRECT_URL is not set/);
  });
  it("warns when production could migrate during a build", () => {
    const r = checkEnv({ ...good, ADMIN_USERNAME: "admin", ALLOW_PRODUCTION_MIGRATIONS: "1" }, "production");
    expect(r.warnings.join("\n")).toMatch(/RUN_DB_MIGRATIONS=1 on production/);
    expect(r.warnings.join("\n")).toMatch(/ALLOW_PRODUCTION_MIGRATIONS/);
    expect(r.warnings.join("\n")).toMatch(/guessable default/);
  });
  it("never includes a secret value in its output", () => {
    const secret = "TOPSECRETVALUE-" + "z".repeat(40);
    const out = formatReport(checkEnv({ ...good, SESSION_SECRET: secret, DATABASE_URL: "postgresql://user:hunter2pw@db.example.com/x" }, "preview"));
    expect(out).not.toContain(secret);
    expect(out).not.toContain("hunter2pw");
    expect(out).not.toContain(goodHash);
  });
});

describe("migration guard used by the Vercel build", () => {
  it("allows nothing to happen unless migrations are opted into", () => {
    expect(migrationBlockers({})).toEqual([]);
    expect(migrationBlockers({ DATABASE_URL: "postgresql://x" })).toEqual([]);
  });
  it("requires DIRECT_URL and never falls back to the pooled DATABASE_URL", () => {
    expect(migrationBlockers({ RUN_DB_MIGRATIONS: "1", DATABASE_URL: "postgresql://pooled" }).join()).toMatch(/requires DIRECT_URL/);
    expect(migrationBlockers({ RUN_DB_MIGRATIONS: "1", DIRECT_URL: "   " }).join()).toMatch(/requires DIRECT_URL/);
    expect(migrationBlockers({ RUN_DB_MIGRATIONS: "1", DIRECT_URL: "postgresql://direct", EXPECTED_DB_ENDPOINT: "direct" })).toEqual([]);
  });
  it("refuses to migrate production from a build unless explicitly overridden", () => {
    const env = { RUN_DB_MIGRATIONS: "1", DIRECT_URL: "postgresql://direct", EXPECTED_DB_ENDPOINT: "direct", VERCEL_ENV: "production" };
    expect(migrationBlockers(env).join()).toMatch(/production database/);
    expect(migrationBlockers({ ...env, ALLOW_PRODUCTION_MIGRATIONS: "1" })).toEqual([]);
    expect(migrationBlockers({ ...env, VERCEL_ENV: "preview" })).toEqual([]);
  });
});

describe("smoke-test validators", () => {
  const goodCookie = "__Host-dfk_admin_session=abc.def; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=strict";
  it("accepts the production cookie", () => {
    expect(checkSessionCookie(goodCookie, { https: true })).toEqual([]);
  });
  it("accepts the plain dev cookie over http", () => {
    expect(checkSessionCookie("dfk_admin_session=abc; Max-Age=28800; Path=/; HttpOnly; SameSite=strict", { https: false })).toEqual([]);
  });
  it("flags each weakness", () => {
    const bad = checkSessionCookie("dfk_admin_session=abc; Domain=example.com; Path=/x; SameSite=lax; Max-Age=999999", { https: true });
    expect(bad.join("\n")).toMatch(/__Host-/);
    expect(bad.join("\n")).toMatch(/HttpOnly/);
    expect(bad.join("\n")).toMatch(/Secure/);
    expect(bad.join("\n")).toMatch(/SameSite/);
    expect(bad.join("\n")).toMatch(/Path/);
    expect(bad.join("\n")).toMatch(/Domain/);
    expect(bad.join("\n")).toMatch(/lifetime/);
  });
  const goodHeaders: Record<string, string> = {
    "content-security-policy": "default-src 'self'; script-src 'self' 'nonce-AbC123+/=' 'strict-dynamic'; frame-ancestors 'none'",
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "strict-transport-security": "max-age=63072000; includeSubDomains",
  };
  it("accepts good page headers and rejects weak ones", () => {
    expect(checkPageHeaders((h) => goodHeaders[h], { https: true })).toEqual([]);
    const weak = checkPageHeaders((h) => ({ "content-security-policy": "script-src 'unsafe-inline'", "x-powered-by": "Next.js" } as Record<string, string>)[h], { https: true });
    expect(weak.join("\n")).toMatch(/nonce/);
    expect(weak.join("\n")).toMatch(/unsafe/);
    expect(weak.join("\n")).toMatch(/X-Powered-By/);
    expect(weak.join("\n")).toMatch(/HSTS/);
  });
});

describe("migration URL resolution: DIRECT_URL, then DATABASE_URL_UNPOOLED, then (local only) DATABASE_URL", () => {
  const A = "postgresql://a:a@direct.example.com/db";
  const B = "postgresql://b:b@unpooled.example.com/db";
  const C = "postgresql://c:c@pooled.example.com/db";

  it("DIRECT_URL always has the highest priority", () => {
    expect(resolveDirectUrl({ DIRECT_URL: A, DATABASE_URL_UNPOOLED: B })).toEqual({ name: "DIRECT_URL", value: A });
    expect(resolveMigrationUrl({ DIRECT_URL: A, DATABASE_URL_UNPOOLED: B, DATABASE_URL: C })).toMatchObject({ name: "DIRECT_URL", direct: true });
  });
  it("falls back to DATABASE_URL_UNPOOLED when DIRECT_URL is absent", () => {
    expect(resolveDirectUrl({ DATABASE_URL_UNPOOLED: B })).toEqual({ name: "DATABASE_URL_UNPOOLED", value: B });
    expect(resolveMigrationUrl({ DATABASE_URL_UNPOOLED: B, DATABASE_URL: C })).toMatchObject({ name: "DATABASE_URL_UNPOOLED", direct: true });
  });
  it("treats an empty or whitespace-only DIRECT_URL as absent", () => {
    for (const blank of ["", "   ", "\n"]) {
      expect(resolveDirectUrl({ DIRECT_URL: blank, DATABASE_URL_UNPOOLED: B })?.name).toBe("DATABASE_URL_UNPOOLED");
    }
  });
  it("trims stray whitespace around a value", () => {
    expect(resolveDirectUrl({ DIRECT_URL: `  ${A}\n` })?.value).toBe(A);
  });
  it("only ever uses DATABASE_URL (pooled) as a non-direct local fallback", () => {
    expect(resolveDirectUrl({ DATABASE_URL: C })).toBeNull();
    expect(resolveMigrationUrl({ DATABASE_URL: C })).toEqual({ name: "DATABASE_URL", value: C, direct: false });
    expect(resolveMigrationUrl({})).toBeNull();
  });
  it("lists exactly the two supported direct-URL variables, DIRECT_URL first", () => {
    expect([...DIRECT_URL_VARS]).toEqual(["DIRECT_URL", "DATABASE_URL_UNPOOLED"]);
  });

  describe("build guards accept the Neon integration's variable", () => {
    const neon = {
      DATABASE_URL: "postgresql://u:p@ep-x-pooler.example.com/db?sslmode=verify-full",
      DATABASE_URL_UNPOOLED: "postgresql://u:p@ep-x.example.com/db?sslmode=verify-full",
      ADMIN_USERNAME: "ops-admin",
      ADMIN_PASSWORD_HASH: goodHash,
      SESSION_SECRET: "Xk9".repeat(16) + "abcdefghijklmnop",
      RUN_DB_MIGRATIONS: "1",
      EXPECTED_DB_ENDPOINT: "ep-x",
    };
    it("migrationBlockers allows migrations with only DATABASE_URL_UNPOOLED", () => {
      expect(migrationBlockers({ RUN_DB_MIGRATIONS: "1", DATABASE_URL_UNPOOLED: B, EXPECTED_DB_ENDPOINT: "unpooled" })).toEqual([]);
    });
    it("migrationBlockers still blocks with only the pooled DATABASE_URL, or a blank UNPOOLED", () => {
      expect(migrationBlockers({ RUN_DB_MIGRATIONS: "1", DATABASE_URL: C }).join()).toMatch(/requires DIRECT_URL \(or DATABASE_URL_UNPOOLED\)/);
      expect(migrationBlockers({ RUN_DB_MIGRATIONS: "1", DATABASE_URL_UNPOOLED: "  " })).not.toEqual([]);
    });
    it("production is still refused even with a valid UNPOOLED URL", () => {
      const env = { RUN_DB_MIGRATIONS: "1", DATABASE_URL_UNPOOLED: B, VERCEL_ENV: "production" };
      expect(migrationBlockers(env).join()).toMatch(/production database/);
    });
    it("checkEnv: a Neon-style Preview configuration has no errors or warnings and names the variable used", () => {
      const r = checkEnv(neon, "preview");
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect(r.ok.join("\n")).toMatch(/DATABASE_URL_UNPOOLED is used as the direct URL because DIRECT_URL is not set/);
    });
    it("checkEnv: DIRECT_URL is reported as taking priority when both are set", () => {
      const r = checkEnv({ ...neon, DIRECT_URL: "postgresql://u:p@ep-x.example.com/other?sslmode=verify-full" }, "preview");
      expect(r.errors).toEqual([]);
      expect(r.ok.join("\n")).toMatch(/DIRECT_URL takes priority over DATABASE_URL_UNPOOLED/);
      expect(r.ok.join("\n")).not.toMatch(/used as the direct URL/);
    });
    it("checkEnv: still errors when migrations are on and neither direct variable is set", () => {
      const { DATABASE_URL_UNPOOLED: _drop, ...none } = neon;
      void _drop;
      expect(checkEnv(none, "preview").errors.join()).toMatch(/DIRECT_URL is not set/);
    });
    it("checkEnv: warns when the UNPOOLED variable actually looks pooled", () => {
      const r = checkEnv({ ...neon, DATABASE_URL_UNPOOLED: "postgresql://u:p@ep-x-pooler.example.com/db?sslmode=verify-full" }, "preview");
      expect(r.warnings.join("\n")).toMatch(/DATABASE_URL_UNPOOLED looks like a POOLED connection/);
    });
    it("checkEnv: validates TLS on the UNPOOLED URL like any other remote URL", () => {
      const r = checkEnv({ ...neon, DATABASE_URL_UNPOOLED: "postgresql://u:p@ep-x.example.com/db" }, "preview");
      expect(r.errors.join()).toMatch(/DATABASE_URL_UNPOOLED points to a remote host but sslmode/);
    });
    it("never prints a connection string, host or password", () => {
      const out = formatReport(checkEnv({ ...neon, DATABASE_URL_UNPOOLED: "postgresql://secretuser:secretpw99@host-unpooled.example.com/db" }, "preview"));
      for (const leak of ["secretuser", "secretpw99", "host-unpooled.example.com", "postgresql://"]) expect(out).not.toContain(leak);
    });
  });
});
