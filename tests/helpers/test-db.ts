import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createPrismaClient, type Db } from "@/lib/db";

// Database tests need a real PostgreSQL. Point TEST_DATABASE_URL at a throwaway
// database (never production). Each test file gets its own schema, built from
// the real migration files, and drops it afterwards.
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasTestDb = Boolean(TEST_DATABASE_URL);

const MIGRATIONS_DIR = path.resolve(__dirname, "../../prisma/migrations");

export function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => path.join(MIGRATIONS_DIR, name, "migration.sql"));
}

export function newSchemaName(): string {
  return `t_${randomBytes(6).toString("hex")}`;
}

export function urlWithSchema(url: string, schema: string): string {
  const u = new URL(url);
  u.searchParams.set("schema", schema);
  return u.toString();
}

export async function withPgClient<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function dropSchema(schema: string): Promise<void> {
  await withPgClient((c) => c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`));
}

export type TestDb = { db: Db; schema: string; url: string; cleanup: () => Promise<void> };

/** Fresh schema with every migration applied, plus a Prisma client bound to it. */
export async function createTestDb(): Promise<TestDb> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  const schema = newSchemaName();
  await withPgClient(async (c) => {
    await c.query(`CREATE SCHEMA "${schema}"`);
    await c.query(`SET search_path TO "${schema}"`);
    for (const file of migrationFiles()) await c.query(fs.readFileSync(file, "utf8"));
  });
  const db = createPrismaClient(TEST_DATABASE_URL, { schema, maxConnections: 8 });
  return {
    db,
    schema,
    url: TEST_DATABASE_URL,
    cleanup: async () => {
      await db.$disconnect();
      await dropSchema(schema);
    },
  };
}

export const sampleApplication = {
  applicantName: "Asha Verma",
  email: "asha@example.com",
  loanProduct: "personal" as const,
  requestedAmount: 50000,
  purpose: "",
};
