// Dependency audit gate.
//   1. Production dependencies must have NO high/critical advisories (fails otherwise).
//   2. The full tree (incl. dev tools) may only contain the advisories listed in
//      ACCEPTED below. Anything new fails, so unresolved findings can't grow silently.
// Accepted entries are documented in docs/dependency-audit.md. Remove an entry as
// soon as a fixed version exists.
import { spawnSync } from "node:child_process";

/** package -> advisories accepted for that package (empty array = transitive only). */
export const ACCEPTED = {
  // GHSA-vfj7-8cjw-p6xm: stack exhaustion on deeply nested brace patterns. No fixed
  // release exists (3.0.3 is the newest and is affected). Dev tooling only.
  braces: ["GHSA-vfj7-8cjw-p6xm"],
  // The rest of the chain only inherits the braces advisory.
  micromatch: [],
  "fast-glob": [],
  "@next/eslint-plugin-next": [],
  "eslint-config-next": [],
};

const HIGH = new Set(["high", "critical"]);

function advisoryId(via) {
  const m = /GHSA-[a-z0-9-]+/i.exec(via.url ?? "");
  return m ? m[0] : String(via.source ?? "unknown");
}

/**
 * @param {{vulnerabilities?: Record<string, any>}} full  `npm audit --json`
 * @param {{vulnerabilities?: Record<string, any>}} prod  `npm audit --omit=dev --json`
 * @param {Record<string, string[]>} accepted
 */
export function evaluateAudit(full, prod, accepted = ACCEPTED) {
  const failures = [];
  const notes = [];

  for (const [name, v] of Object.entries(prod.vulnerabilities ?? {})) {
    if (HIGH.has(v.severity)) failures.push(`PRODUCTION dependency ${name} has a ${v.severity} advisory`);
  }

  const seen = new Set();
  for (const [name, v] of Object.entries(full.vulnerabilities ?? {})) {
    seen.add(name);
    if (!(name in accepted)) {
      failures.push(`${name} (${v.severity}) is not in the accepted list`);
      continue;
    }
    for (const via of v.via ?? []) {
      if (typeof via === "string") {
        if (!(via in accepted)) failures.push(`${name} is affected through ${via}, which is not accepted`);
      } else if (!accepted[name].includes(advisoryId(via))) {
        failures.push(`${name} has a NEW advisory ${advisoryId(via)}: ${via.title}`);
      }
    }
  }
  for (const name of Object.keys(accepted)) {
    if (!seen.has(name)) notes.push(`accepted entry "${name}" no longer appears in the audit: remove it from ACCEPTED`);
  }
  return { failures, notes };
}

function runAudit(args) {
  // `npm audit` exits non-zero when it finds anything, so ignore the exit code and parse stdout.
  const r = spawnSync("npm", ["audit", "--json", ...args], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`could not parse npm audit output (is the registry reachable?): ${r.stderr.slice(0, 200)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let full, prod;
  try {
    full = runAudit([]);
    prod = runAudit(["--omit=dev"]);
  } catch (e) {
    console.error(`Audit gate FAILED: ${e.message}`);
    process.exit(1);
  }
  const { failures, notes } = evaluateAudit(full, prod);
  const counts = full.metadata?.vulnerabilities ?? {};
  console.log(`Full tree: ${JSON.stringify(counts)}`);
  console.log(`Production-only: ${JSON.stringify(prod.metadata?.vulnerabilities ?? {})}`);
  for (const n of notes) console.log(`note: ${n}`);
  if (failures.length) {
    for (const f of failures) console.error(`FAIL: ${f}`);
    process.exit(1);
  }
  console.log("Audit gate passed: production is clean; only the documented dev-tool advisories remain.");
}
