// Build entry point for Vercel (package.json "vercel-build").
//
// Migrations are OPT-IN so that a build can never change a database by accident:
//   RUN_DB_MIGRATIONS=1               -> run `prisma migrate deploy` before building (requires DIRECT_URL or DATABASE_URL_UNPOOLED,
//                                        AND EXPECTED_DB_ENDPOINT naming the one database allowed to be migrated)
//   VERCEL_ENV=production additionally requires ALLOW_PRODUCTION_MIGRATIONS=1
//
// Recommended: set RUN_DB_MIGRATIONS=1 on the Preview environment only, with a
// DIRECT_URL that points at the PREVIEW database. Apply production migrations
// deliberately (see README). This script never prints connection strings.
import { spawnSync } from "node:child_process";
import { checkEnv, formatReport, migrationBlockers } from "./check-env.mjs";
import { resolveDirectUrl } from "./lib/direct-url.mjs";
import { describeDbHost } from "./lib/migration-target.mjs";

function run(args) {
  const result = spawnSync("npx", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["prisma", "generate"]);

// Informational only: report which settings look missing or malformed so a bad
// Preview/Production configuration is visible in the build log. Never prints values.
// It does not fail the build, because the database may legitimately not exist yet.
const target = process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "preview" : "local";
console.log(`Environment check (${target}):`);
console.log(formatReport(checkEnv(process.env, target)));

if (process.env.RUN_DB_MIGRATIONS === "1") {
  const blockers = migrationBlockers(process.env);
  if (blockers.length > 0) {
    for (const reason of blockers) console.error(reason);
    process.exit(1);
  }
  // Say WHICH variable is used (never its value), so a build log shows the migration target's source.
  // The target endpoint id (host-derived, not a credential) is logged as evidence of what was verified.
  const direct = resolveDirectUrl(process.env);
  console.log(
    `Migration target verified: ${direct?.name} -> endpoint ${describeDbHost(direct?.value ?? "")?.endpointId} (matches EXPECTED_DB_ENDPOINT).`,
  );
  console.log(`Applying database migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "local"}) using ${direct?.name}...`);
  run(["prisma", "migrate", "deploy"]);
} else {
  console.log("Skipping database migrations (RUN_DB_MIGRATIONS is not 1).");
}

run(["next", "build"]);
