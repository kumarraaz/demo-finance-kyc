import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";
import { resolveMigrationUrl } from "./scripts/lib/direct-url.mjs";

// Prisma 7 no longer reads .env files itself, so load them here, the way Next.js
// does for the app: .env.local first, then .env. dotenv never overrides a
// variable that is already set, so real environment variables (CI, Vercel) win.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

// Migrations should use a DIRECT (non-pooled) connection. Order: DIRECT_URL, then
// DATABASE_URL_UNPOOLED (set by the Neon integration for Vercel), then DATABASE_URL
// (local convenience only). Nothing secret is stored in this file.
// `prisma generate` does not need a database, so a missing URL is tolerated here.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: resolveMigrationUrl(process.env)?.value ?? "" },
});
