import { defineConfig } from "prisma/config";

// Migrations should use a DIRECT (non-pooled) connection. Falls back to
// DATABASE_URL. Both are read from the environment only; nothing is stored here.
// `prisma generate` does not need a database, so a missing URL is tolerated.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "" },
});
