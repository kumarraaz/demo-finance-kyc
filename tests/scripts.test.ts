import { describe, expect, it } from "vitest";
import { ACCEPTED, evaluateAudit } from "../scripts/audit-gate.mjs";
import { evaluateReport } from "../scripts/assert-no-skips.mjs";
import { checkEnv, formatReport } from "../scripts/check-env.mjs";

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
  it("rejects a malformed password hash, a short secret and a non-postgres URL", () => {
    const r = checkEnv({ ...good, ADMIN_PASSWORD_HASH: "plaintext-password", SESSION_SECRET: "short", DATABASE_URL: "mysql://u:p@h/db" }, "preview");
    expect(r.errors.join("\n")).toMatch(/scrypt/);
    expect(r.errors.join("\n")).toMatch(/shorter than 32/);
    expect(r.errors.join("\n")).toMatch(/must start with postgresql/);
  });
  it("requires TLS for remote databases but not for localhost", () => {
    expect(checkEnv({ ...good, DATABASE_URL: "postgresql://u:p@db.example.com/x" }, "preview").errors.join()).toMatch(/sslmode/);
    expect(checkEnv({ ...good, DATABASE_URL: "postgresql://u:p@db.example.com/x?sslmode=disable" }, "preview").errors.join()).toMatch(/sslmode/);
    expect(checkEnv({ ...good, DATABASE_URL: "postgresql://u:p@localhost:5432/x", DIRECT_URL: "postgresql://u:p@localhost:5432/x" }, "local").errors).toEqual([]);
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
