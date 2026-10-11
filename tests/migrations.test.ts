import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dropSchema, hasTestDb, migrationFiles, newSchemaName, TEST_DATABASE_URL, urlWithSchema, withPgClient } from "./helpers/test-db";

const ROOT = path.resolve(__dirname, "..");
const PRISMA = path.join(ROOT, "node_modules", ".bin", "prisma");

describe.skipIf(!hasTestDb)("prisma migrations (real CLI, PostgreSQL)", () => {
  const schema = newSchemaName();
  let env: NodeJS.ProcessEnv;

  const prisma = (...args: string[]) => {
    try {
      return { code: 0, out: execFileSync(PRISMA, args, { cwd: ROOT, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  };

  beforeAll(async () => {
    await withPgClient((c) => c.query(`CREATE SCHEMA "${schema}"`));
    env = { ...process.env, DIRECT_URL: urlWithSchema(TEST_DATABASE_URL!, schema), DATABASE_URL: "" };
  });
  afterAll(async () => {
    await dropSchema(schema);
  });

  it("has at least one migration and a provider lock file", () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
  });

  it("status reports pending before deploy", () => {
    const r = prisma("migrate", "status");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not yet been applied|have not yet/i);
  });

  it("deploy applies every migration to an empty database", () => {
    const r = prisma("migrate", "deploy");
    expect(r.out).toMatch(/successfully applied/i);
    expect(r.code).toBe(0);
  });

  it("deploy is idempotent: running it again changes nothing", () => {
    const r = prisma("migrate", "deploy");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/No pending migrations/i);
  });

  it("status reports up to date", () => {
    const r = prisma("migrate", "status");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/up to date/i);
  });

  it("records each migration as finished, none rolled back", async () => {
    const rows = await withPgClient(async (c) => {
      await c.query(`SET search_path TO "${schema}"`);
      return (await c.query("SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations")).rows;
    });
    expect(rows.length).toBe(migrationFiles().length);
    for (const r of rows) {
      expect(r.finished_at).not.toBeNull();
      expect(r.rolled_back_at).toBeNull();
    }
  });

  it("schema.prisma matches the migrations (no un-migrated model changes)", () => {
    const r = prisma("migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code");
    expect(r.out).toMatch(/No difference detected/i);
    expect(r.code).toBe(0);
  });

  it("creates the protections Prisma cannot model: triggers, CHECKs, sequence", async () => {
    const found = await withPgClient(async (c) => {
      const q = async (sql: string) => (await c.query(sql, [schema])).rows.map((r) => Object.values(r)[0] as string);
      return {
        triggers: await q(
          `SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1 AND NOT t.tgisinternal`,
        ),
        checks: await q(
          `SELECT conname FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace WHERE n.nspname = $1 AND k.contype = 'c'`,
        ),
        sequences: await q(`SELECT sequencename FROM pg_sequences WHERE schemaname = $1`),
      };
    });
    expect(found.triggers).toEqual(expect.arrayContaining(["status_history_no_update_delete", "status_history_no_truncate"]));
    expect(found.checks).toEqual(
      expect.arrayContaining([
        "applications_requested_amount_positive",
        "applications_is_simulated_true",
        "applications_reference_format",
        "status_history_status_changes",
        "rate_limits_count_positive",
      ]),
    );
    expect(found.sequences).toContain("application_reference_seq");
  });
});
