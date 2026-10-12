// Single source of truth for "which connection string do MIGRATIONS use?".
// Shared by prisma.config.ts, scripts/check-env.mjs and scripts/vercel-build.mjs so the
// Prisma CLI and the build guards can never disagree.
//
// Order (first non-blank wins):
//   1. DIRECT_URL              - explicit; always highest priority
//   2. DATABASE_URL_UNPOOLED   - the direct (non-pooled) URL that the Neon integration for Vercel provides
//   3. DATABASE_URL            - the pooled runtime URL; only for local convenience (see resolveMigrationUrl)
//
// Functions return the variable NAME and value. Callers must print only the name, never the value.

/** Variables that count as "a direct (non-pooled) URL", in priority order. */
export const DIRECT_URL_VARS = ["DIRECT_URL", "DATABASE_URL_UNPOOLED"];

const clean = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ name: string, value: string } | null} the direct URL to use, if any
 */
export function resolveDirectUrl(env) {
  for (const name of DIRECT_URL_VARS) {
    const value = clean(env[name]);
    if (value) return { name, value };
  }
  return null;
}

/**
 * The URL `prisma migrate` should use: a direct URL if one exists, otherwise DATABASE_URL.
 * The DATABASE_URL fallback exists for local development only; build guards require a direct URL.
 * @param {Record<string, string | undefined>} env
 * @returns {{ name: string, value: string, direct: boolean } | null}
 */
export function resolveMigrationUrl(env) {
  const direct = resolveDirectUrl(env);
  if (direct) return { ...direct, direct: true };
  const value = clean(env.DATABASE_URL);
  return value ? { name: "DATABASE_URL", value, direct: false } : null;
}
