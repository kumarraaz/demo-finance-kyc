import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.resolve(__dirname, "../prisma/migrations");
const dirs = fs.readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

describe("migration files (static checks, no database needed)", () => {
  it("has a postgresql provider lock file", () => {
    expect(fs.readFileSync(path.join(DIR, "migration_lock.toml"), "utf8")).toMatch(/provider\s*=\s*"postgresql"/);
  });
  it("uses sortable timestamp names and each has a migration.sql", () => {
    expect(dirs.length).toBeGreaterThan(0);
    for (const d of dirs) {
      expect(d).toMatch(/^\d{14}_[a-z0-9_]+$/);
      expect(fs.existsSync(path.join(DIR, d, "migration.sql"))).toBe(true);
    }
    expect([...dirs].sort()).toEqual(dirs.sort());
  });
  // Regression: `CREATE SCHEMA IF NOT EXISTS "public"` needs CREATE on the database
  // even when the schema exists, so it fails for a least-privilege migration role.
  it.each(dirs)("%s only needs ordinary object-owner privileges", (d) => {
    const sql = fs.readFileSync(path.join(DIR, d, "migration.sql"), "utf8").replace(/--.*$/gm, "");
    for (const forbidden of [/CREATE\s+SCHEMA/i, /CREATE\s+DATABASE/i, /CREATE\s+EXTENSION/i, /CREATE\s+ROLE/i, /\bGRANT\b/i, /ALTER\s+(DATABASE|ROLE|SYSTEM)/i, /DROP\s+(DATABASE|SCHEMA|ROLE)/i]) {
      expect(sql, `${d} contains ${forbidden}`).not.toMatch(forbidden);
    }
  });
  it("the initial migration keeps the hand-written protections Prisma cannot regenerate", () => {
    const sql = fs.readFileSync(path.join(DIR, dirs.sort()[0], "migration.sql"), "utf8");
    for (const needle of ["status_history_no_update_delete", "status_history_no_truncate", "applications_is_simulated_true", "application_reference_seq"]) {
      expect(sql).toContain(needle);
    }
  });
  it("never stores credentials", () => {
    for (const d of dirs) {
      expect(fs.readFileSync(path.join(DIR, d, "migration.sql"), "utf8")).not.toMatch(/PASSWORD|postgres(ql)?:\/\//i);
    }
  });
});
