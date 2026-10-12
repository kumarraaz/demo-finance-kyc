import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import pg from "pg";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;

type Options = {
  /** Max connections held by this process. Keep low on serverless. */
  maxConnections?: number;
  /** Use a non-default Postgres schema (tests). */
  schema?: string;
};

export function createPrismaClient(connectionString: string, opts: Options = {}): PrismaClient {
  const pool = new pg.Pool({
    connectionString,
    max: opts.maxConnections ?? Number(process.env.DATABASE_POOL_MAX ?? 5),
    // Short idle timeout: serverless instances freeze, and long-idle sockets
    // are often dropped by poolers. attachDatabasePool reads this value.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ...(opts.schema ? { options: `-c search_path=${opts.schema}` } : {}),
  });
  // Without this, an idle client that the server drops would crash the process
  // with an unhandled 'error' event.
  pool.on("error", (err) => console.error("Idle database client error:", err.message));
  // On Vercel Fluid Compute this releases idle connections before a function
  // is suspended. Outside Vercel's runtime it does nothing.
  attachDatabasePool(pool);
  const adapter = new PrismaPg(pool, opts.schema ? { schema: opts.schema } : undefined);
  return new PrismaClient({ adapter });
}

const globalForDb = globalThis as unknown as { __demoKycDb?: PrismaClient };

// Lazy: importing this module never opens a connection, so `next build`
// works without a database. Reuse one client per process (also across hot reloads).
export function getDb(): PrismaClient {
  if (!globalForDb.__demoKycDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__demoKycDb = createPrismaClient(url);
  }
  return globalForDb.__demoKycDb;
}
