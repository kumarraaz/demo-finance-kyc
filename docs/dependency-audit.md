# Dependency audit

Last reviewed with `npm audit` against the registry on the day this branch was prepared.

| Scope | Command | Result |
| --- | --- | --- |
| Production dependencies | `npm audit --omit=dev` | **0 vulnerabilities** |
| Whole tree (incl. dev tools) | `npm audit` | **5 high**, all one chain (below) |

CI runs `npm run audit:gate` (`scripts/audit-gate.mjs`). It **fails** if:

- any production dependency has a high or critical advisory, or
- the full tree contains any package or advisory that is not in the accepted list in that script.

So the five findings below cannot grow or change silently. The gate also prints a note when an accepted entry disappears, so the list gets cleaned up.

## Unresolved: development-tool vulnerabilities (5 high, one chain)

```
eslint-config-next@16.4.0
  -> @next/eslint-plugin-next@16.4.0
     -> fast-glob@3.3.1
        -> micromatch@4.0.8
           -> braces@3.0.3          <- the vulnerable package
```

| Package | Installed | Latest published | Why it is listed |
| --- | --- | --- | --- |
| `braces` | 3.0.3 | 3.0.3 | **GHSA-vfj7-8cjw-p6xm**, CVSS 7.5. Stack exhaustion (denial of service) on deeply nested brace patterns. Affected range `<=3.0.3`. |
| `micromatch` | 4.0.8 | 4.0.8 | Depends on `braces ^3.0.3`. |
| `fast-glob` | 3.3.1 | 3.3.3 | Depends on `micromatch ^4`. Newer release does not change this. |
| `@next/eslint-plugin-next` | 16.4.0 | 16.4.0 | Pins `fast-glob 3.3.1`. |
| `eslint-config-next` | 16.4.0 | 16.4.0 | Direct dev dependency. |

### Why it is not fixed

- **No fixed `braces` exists.** The advisory covers every published version, up to and including the newest, 3.0.3. There is nothing to upgrade to.
- **The suggested `npm audit fix --force` is not a real fix.** It proposes `eslint-config-next@14.2.35`, which is two major versions older. It targets ESLint 7/8 and Next 14, while this project uses ESLint 9 flat config and Next 16. It "fixes" the report only by removing the dependency chain, at the cost of a broken or unsupported lint setup. Rejected.
- **Overriding `braces` to another version is not possible** for the same reason: there is no unaffected version.

### Risk assessment

- **Not shipped.** `npm ls --omit=dev braces micromatch fast-glob` is empty. None of these are in the deployed bundle or the serverless functions.
- **No attacker-controlled input.** In `@next/eslint-plugin-next`, `fast-glob` is used only in `get-root-dirs.js`, to expand the optional `settings.next.rootDir` value from the ESLint config. This repository does not set it. The pattern comes from our own committed config, not from users or the network.
- **Residual exposure:** a developer or CI machine running ESLint with a malicious, deeply nested `rootDir` pattern could hang or crash that process. That requires someone to commit it first.

### How to re-check

```bash
npm view braces version            # still 3.0.3? then still unfixed
npm audit                          # does the count change?
npm run audit:gate                 # does the gate still pass?
```

When a fixed `braces` (or a `fast-glob`/`micromatch` that no longer depends on it, or an `eslint-config-next` that drops it) is published: upgrade, run `npm audit`, then delete the matching entries from `ACCEPTED` in `scripts/audit-gate.mjs`.

## Resolved: Prisma CLI transitive advisories

Adding Prisma 7.10.0 introduced four more high findings (`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`). The `prisma` package pins old versions exactly:

| Package | Pinned by Prisma | Fixed in | Advisory |
| --- | --- | --- | --- |
| `mysql2` | 3.15.3 | >= 3.24.5 (same major) | GHSA-3f6p-5ww8-9rcr (auth plugin downgrade leaks plaintext credentials), GHSA-rgwj-5xj2-c3m3 (decompression bomb DoS) |
| `deepmerge-ts` | 7.1.5 | 8.0.2 (**major** bump) | GHSA-ggr8-5vv4-36mx (stack exhaustion on recursive objects) |

Fixed with `overrides` in `package.json`: `"mysql2": "^3.24.5"`, `"deepmerge-ts": "^8.0.2"`.

- This project uses PostgreSQL only; the MySQL code in the Prisma CLI is never run.
- `deepmerge-ts` is a major-version change inside a tool we do not control. It was verified by running the real Prisma CLI: `generate`, `validate`, `migrate deploy`, `migrate status`, `migrate diff`, and the migration test-suite all pass. Other Prisma commands (for example `db pull`, `studio`) were not exercised.
- Prisma's npm `latest` tag points at `8.0.0-rc.22`, a pre-release with a different toolchain and no matching `@prisma/client`. Not adopted.
- **Revisit the overrides on every Prisma upgrade**, and remove them once Prisma ships fixed versions.

## Added dependency: `@vercel/functions`

Used only for `attachDatabasePool` (releases idle database connections before a Vercel function is suspended). It does nothing outside Vercel's runtime. `npm audit --omit=dev` stays at 0.
