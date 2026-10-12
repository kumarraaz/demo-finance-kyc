// Checks that the environment variables for a deployment target are present and
// well-formed. It NEVER prints a value, only variable names and what is wrong.
//
//   node scripts/check-env.mjs [local|preview|production] [--strict]
//
// To check what Vercel will actually use, without writing secrets to disk:
//   vercel env run -e preview -- npm run check-env -- preview
//
// Exit code 1 if there are errors (or warnings with --strict).

import { resolveDirectUrl } from "./lib/direct-url.mjs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * @param {Record<string, string | undefined>} env
 * @param {"local" | "preview" | "production"} target
 */
export function checkEnv(env, target = "local") {
  const errors = [];
  const warnings = [];
  const ok = [];
  const isSet = (k) => typeof env[k] === "string" && env[k].trim() !== "";

  // --- database URLs ---
  const parseDb = (key) => {
    if (!isSet(key)) return null;
    let u;
    try {
      u = new URL(env[key]);
    } catch {
      errors.push(`${key} is not a valid URL`);
      return null;
    }
    if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") {
      errors.push(`${key} must start with postgresql:// (found "${u.protocol}//")`);
      return null;
    }
    if (!u.hostname) errors.push(`${key} has no host`);
    if (!u.username || !u.password) errors.push(`${key} is missing a username or password`);
    const remote = !LOCAL_HOSTS.has(u.hostname);
    const mode = u.searchParams.get("sslmode");
    if (remote && (!mode || mode === "disable")) {
      errors.push(`${key} points to a remote host but sslmode is ${mode ?? "not set"}; use sslmode=verify-full`);
    } else if (remote && mode !== "verify-full") {
      warnings.push(
        `${key} uses sslmode=${mode}. The pg driver treats this as verify-full today and will weaken it in pg v9; write sslmode=verify-full explicitly`,
      );
    }
    if (remote && mode === "verify-full") ok.push(`${key} requires verified TLS`);
    return u;
  };
  const db = parseDb("DATABASE_URL");
  // The direct (non-pooled) URL: DIRECT_URL, else DATABASE_URL_UNPOOLED. Only the NAME is ever reported.
  const resolved = resolveDirectUrl(env);
  const direct = resolved ? parseDb(resolved.name) : null;
  if (!db) {
    if (!isSet("DATABASE_URL")) errors.push("DATABASE_URL is not set");
  } else ok.push("DATABASE_URL is set and well-formed");

  const looksPooled = (u) => u && (/pooler/i.test(u.hostname) || u.port === "6543");
  const willMigrate = env.RUN_DB_MIGRATIONS === "1";
  if (!resolved) {
    if (willMigrate) errors.push("RUN_DB_MIGRATIONS=1 but DIRECT_URL is not set (and there is no DATABASE_URL_UNPOOLED fallback)");
    else if (target !== "local") warnings.push("No direct URL (DIRECT_URL or DATABASE_URL_UNPOOLED) is set; migrations would fall back to DATABASE_URL");
  } else {
    ok.push(`${resolved.name} is set and well-formed`);
    if (resolved.name === "DATABASE_URL_UNPOOLED") {
      ok.push("DATABASE_URL_UNPOOLED is used as the direct URL because DIRECT_URL is not set");
    } else if (isSet("DATABASE_URL_UNPOOLED")) {
      ok.push("DIRECT_URL takes priority over DATABASE_URL_UNPOOLED");
    }
    if (looksPooled(direct)) {
      warnings.push(`${resolved.name} looks like a POOLED connection (host contains 'pooler' or port is 6543); migrations need the direct one`);
    }
  }
  if (db && direct && db.href === direct.href) {
    warnings.push(`${resolved.name} and DATABASE_URL are identical; fine only if the provider has no pooler`);
  }
  if (db && target === "production" && looksPooled(db) === false && db.hostname && !LOCAL_HOSTS.has(db.hostname)) {
    warnings.push("DATABASE_URL does not look pooled; on serverless prefer the provider's pooled connection string");
  }

  // --- admin login ---
  if (!isSet("ADMIN_USERNAME")) errors.push("ADMIN_USERNAME is not set");
  else if (target === "production" && env.ADMIN_USERNAME === "admin") {
    warnings.push("ADMIN_USERNAME is the guessable default 'admin'");
  } else ok.push("ADMIN_USERNAME is set");

  if (!isSet("ADMIN_PASSWORD_HASH")) errors.push("ADMIN_PASSWORD_HASH is not set");
  else if (!/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(env.ADMIN_PASSWORD_HASH)) {
    errors.push("ADMIN_PASSWORD_HASH is not in the expected scrypt$<salt>$<hash> format (generate it with npm run hash-password)");
    if (env.ADMIN_PASSWORD_HASH.length < 20 && env.ADMIN_PASSWORD_HASH.startsWith("scrypt")) {
      errors.push("ADMIN_PASSWORD_HASH looks truncated: a '$' was probably expanded as a variable. In .env.local write each '$' as '\\$'");
    }
  } else ok.push("ADMIN_PASSWORD_HASH has the expected format");

  if (!isSet("SESSION_SECRET")) errors.push("SESSION_SECRET is not set");
  else if (env.SESSION_SECRET.length < 32) errors.push("SESSION_SECRET is shorter than 32 characters");
  else if (new Set(env.SESSION_SECRET).size < 10) warnings.push("SESSION_SECRET has very low variety; generate it with openssl rand -base64 48");
  else ok.push("SESSION_SECRET is long enough");

  // --- migration switches ---
  if (target === "production") {
    if (willMigrate) warnings.push("RUN_DB_MIGRATIONS=1 on production: the build will refuse unless ALLOW_PRODUCTION_MIGRATIONS=1, and migrating production should be a manual step");
    if (env.ALLOW_PRODUCTION_MIGRATIONS === "1") warnings.push("ALLOW_PRODUCTION_MIGRATIONS=1 lets a build change the production database");
  }
  if (target === "preview" && !willMigrate) {
    warnings.push("RUN_DB_MIGRATIONS is not 1: Preview builds will not migrate the Preview database (apply migrations manually)");
  }

  return { errors, warnings, ok };
}

/**
 * Conditions that must stop a build from running `prisma migrate deploy`.
 * Migrations need the DIRECT (non-pooled) connection (DIRECT_URL, else DATABASE_URL_UNPOOLED):
 * never fall back to DATABASE_URL, which is the pooled runtime URL.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]} reasons to refuse (empty = allowed)
 */
export function migrationBlockers(env) {
  if (env.RUN_DB_MIGRATIONS !== "1") return [];
  const reasons = [];
  if (!resolveDirectUrl(env)) {
    reasons.push("RUN_DB_MIGRATIONS=1 requires DIRECT_URL (or DATABASE_URL_UNPOOLED), the direct non-pooled connection. It will not fall back to DATABASE_URL.");
  }
  if (env.VERCEL_ENV === "production" && env.ALLOW_PRODUCTION_MIGRATIONS !== "1") {
    reasons.push("Refusing to migrate the production database during a build. Migrate production manually, or set ALLOW_PRODUCTION_MIGRATIONS=1 to override.");
  }
  return reasons;
}

export function formatReport({ errors, warnings, ok }) {
  const lines = [];
  for (const m of ok) lines.push(`  ok    ${m}`);
  for (const m of warnings) lines.push(`  warn  ${m}`);
  for (const m of errors) lines.push(`  ERROR ${m}`);
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--")) ?? "local";
  if (!["local", "preview", "production"].includes(target)) {
    console.error("usage: node scripts/check-env.mjs [local|preview|production] [--strict]");
    process.exit(2);
  }
  const report = checkEnv(process.env, target);
  console.log(`Environment check (${target}) - values are never printed`);
  console.log(formatReport(report));
  const failed = report.errors.length > 0 || (args.includes("--strict") && report.warnings.length > 0);
  console.log(failed ? "Result: NOT ready" : "Result: no blocking problems found (this does not prove the database exists or is reachable)");
  process.exit(failed ? 1 : 0);
}
