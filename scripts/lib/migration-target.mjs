// Guard: a build that migrates must prove WHICH database it is about to change.
//
// RUN_DB_MIGRATIONS=1 is only allowed when EXPECTED_DB_ENDPOINT names the database the migration
// URL points at. For Neon that is the compute endpoint id (the "ep-..." part of the host name),
// for any other provider the full host name. If the URL points anywhere else (for example the
// Production endpoint, because the wrong integration was connected), the build refuses.
//
// Endpoint ids and host names are not credentials. Nothing here ever prints a URL, a user name or
// a password: messages contain only the host-derived endpoint id and the variable NAMES.
import { resolveDirectUrl } from "./direct-url.mjs";

export const EXPECTED_ENDPOINT_VAR = "EXPECTED_DB_ENDPOINT";

// Letters, digits, dots and hyphens only. Anything else (a pasted connection string, for example)
// is rejected WITHOUT being echoed, so a mistake cannot leak a password into a build log.
const SAFE_EXPECTED = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;

/**
 * @param {string} url
 * @returns {{ host: string, endpointId: string, pooled: boolean } | null}
 */
export function describeDbHost(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  const firstLabel = host.split(".")[0];
  const pooled = firstLabel.endsWith("-pooler");
  return { host, endpointId: pooled ? firstLabel.slice(0, -"-pooler".length) : firstLabel, pooled };
}

/**
 * Reasons the migration target must NOT be migrated. Empty = verified. Assumes the caller has
 * already checked that a direct URL exists (this returns [] if there is none).
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function migrationTargetBlockers(env) {
  const direct = resolveDirectUrl(env);
  if (!direct) return [];

  const raw = typeof env[EXPECTED_ENDPOINT_VAR] === "string" ? env[EXPECTED_ENDPOINT_VAR].trim().toLowerCase() : "";
  if (!raw) {
    return [
      `RUN_DB_MIGRATIONS=1 requires ${EXPECTED_ENDPOINT_VAR}: the endpoint id (for Neon, the "ep-..." part of the host) of the database that may be migrated. Without it the build cannot prove it is not about to change the wrong database.`,
    ];
  }
  if (!SAFE_EXPECTED.test(raw)) {
    return [`${EXPECTED_ENDPOINT_VAR} is not a plain endpoint id or host name (its value is not shown). Use only the "ep-..." id, never a connection string.`];
  }

  const target = describeDbHost(direct.value);
  if (!target) return [`${direct.name} is not a valid URL, so the migration target cannot be verified.`];

  const reasons = [];
  if (target.pooled) {
    reasons.push(`${direct.name} points at a POOLED host (endpoint "${target.endpointId}"); migrations need the direct, non-pooled host.`);
  }
  if (raw !== target.endpointId && raw !== target.host) {
    reasons.push(
      `Migration target mismatch: ${direct.name} points at endpoint "${target.endpointId}" but ${EXPECTED_ENDPOINT_VAR} is "${raw}". Refusing to migrate.`,
    );
  }
  // The running app must use the same database that is being verified/migrated. Compare the pooled
  // runtime URL too, when both look like Neon endpoint ids (other providers have unrelated host names).
  const runtimeUrl = typeof env.DATABASE_URL === "string" ? env.DATABASE_URL.trim() : "";
  const runtime = runtimeUrl ? describeDbHost(runtimeUrl) : null;
  if (runtime && runtime.endpointId.startsWith("ep-") && target.endpointId.startsWith("ep-") && runtime.endpointId !== target.endpointId) {
    reasons.push(
      `DATABASE_URL points at endpoint "${runtime.endpointId}" but ${direct.name} points at "${target.endpointId}": the app would use a different database than the one being verified.`,
    );
  }
  return reasons;
}

/**
 * Verification without migrating: when EXPECTED_DB_ENDPOINT is set, a build must prove the URLs point
 * at it even if RUN_DB_MIGRATIONS is off. A READY deployment then means "the target matches".
 * Returns [] when EXPECTED_DB_ENDPOINT is not set (nothing to verify).
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function targetVerificationBlockers(env) {
  const set = typeof env[EXPECTED_ENDPOINT_VAR] === "string" && env[EXPECTED_ENDPOINT_VAR].trim() !== "";
  if (!set) return [];
  if (!resolveDirectUrl(env)) {
    return [`${EXPECTED_ENDPOINT_VAR} is set but there is no direct URL (DIRECT_URL or DATABASE_URL_UNPOOLED) to verify.`];
  }
  return migrationTargetBlockers(env);
}
