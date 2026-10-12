# Demo Finance KYC (simulated prototype)

**DEMO ONLY.** All verification is **simulated**. This project does not perform real KYC, must never be given real PAN or Aadhaar data, collects no identity documents, and never approves or offers a loan. Use fictional data only.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)
- Zod for validation, Vitest for tests, ESLint for linting
- Target host: Vercel (+ a hosted Postgres)

## What it does

- Admin login (scrypt password hash, signed HttpOnly cookie, **server-side sessions** that logout really revokes)
- Dashboard: counts by status, search, status filter, pagination
- Create fictional demo applications; change status; view the full status history
- Append-only audit trail enforced by database triggers

### Status flow

```
submitted -> in_review -> more_info_needed -> in_review
                       -> simulated_check_passed -> closed
                       -> simulated_check_failed -> in_review | closed
any non-final state    -> closed
```

There is deliberately no "approved" or "rejected" status. `simulated_check_*` outcomes are labelled SIMULATED everywhere they appear. A note is required for `more_info_needed`, `simulated_check_failed` and `closed`.

## Routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `/` | public | Landing page |
| `/admin/login` | public | Sign in |
| `/admin` | admin | Overview: status counts, distribution, recent applications, workflow outline |
| `/admin/applications` | admin | Searchable, filterable, paged application list (`?q=`, `?status=`, `?page=`) |
| `/admin/applications/new`, `/admin/applications/[id]` | admin | Create; detail + status update + history timeline |
| `GET /api/health` | public | `{status, database, schema}` only. 503 if the database is unreachable or migrations are missing |
| `POST /api/admin/login` | public | Sign in (rate limited) |
| `POST /api/admin/logout` | cookie | Revokes the session server-side |
| `GET, POST /api/admin/applications` | admin | List / create |
| `GET /api/admin/applications/[id]` | admin | Detail + history |
| `POST /api/admin/applications/[id]/status` | admin | Change status |

## Architecture

| File | Role |
| --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/` | Data model and SQL migrations (incl. hand-written triggers and CHECKs) |
| `prisma.config.ts`, `scripts/lib/direct-url.mjs` | Migration connection: `DIRECT_URL`, else `DATABASE_URL_UNPOOLED` (set by the Neon integration for Vercel), else `DATABASE_URL` (local only) |
| `src/lib/db.ts` | Lazy Prisma client (pg adapter). Importing it never connects, so `next build` needs no database |
| `src/lib/applications.ts` | Create / list / status change (compare-and-set inside a transaction) |
| `src/lib/admin-session.ts`, `session.ts` | Signed token + server-side session row |
| `src/lib/rate-limit.ts` | Shared Postgres rate limiter |
| `src/proxy.ts`, `src/lib/csp.ts` | Per-request CSP nonce + optimistic auth gate |
| `src/lib/http.ts` | `guardWrite` (origin + content-type), `getAdminSession` |
| `src/lib/validation.ts`, `status.ts` | Zod schemas (incl. PAN/Aadhaar-like text guard), status rules |

### Database guarantees (enforced by PostgreSQL, not just app code)

- `status` and `loan_product` are enums. `'approved'` cannot be stored.
- `status_history` is append-only: triggers reject `UPDATE`, `DELETE` and `TRUNCATE`; the foreign key is `RESTRICT`.
- CHECKs: amount > 0, `is_simulated` must be true, reference format `DEMO-nnnnnn`, history rows must actually change status.
- References come from a sequence (unique, never reused).
- Concurrent status changes use compare-and-set: exactly one wins, and history never contradicts the stored status.

A database owner or superuser can still drop triggers. For a real system, give the app a role that is not the table owner.

## Local setup

```bash
npm ci                                   # also runs `prisma generate` (postinstall)
cp .env.example .env.local               # then edit the placeholders
```

You need a PostgreSQL database (tested on 16). For example with Docker (pick your own password; do not reuse a real one):

```bash
docker run --name dfk-pg -e POSTGRES_PASSWORD='choose-a-local-password' -e POSTGRES_DB=dfk -p 5432:5432 -d postgres:16
# DATABASE_URL=postgresql://postgres:choose-a-local-password@localhost:5432/dfk
```

Put the URL in `.env.local` as `DATABASE_URL` (and `DIRECT_URL`, or `DATABASE_URL_UNPOOLED`, if you like). Both Next.js and the Prisma CLI read `.env.local`; a real environment variable always wins over the file. Then:

```bash
npm run db:migrate:deploy                                # apply migrations
npm run hash-password                                    # asks for the password with hidden input; prints the hash for ADMIN_PASSWORD_HASH (see the $ warning below)
openssl rand -base64 48                                  # paste into SESSION_SECRET
npm run dev
```

**Warning: `$` in `.env.local`.** The password hash is `scrypt$<salt>$<hash>`. Next.js expands `$name` in `.env` files, and in every quoting style (unquoted, `"..."`, `'...'`) that silently truncates the hash to `scrypt`. Write each `$` as `\$` in `.env.local` only:

```
ADMIN_PASSWORD_HASH=scrypt\$<salt>\$<hash>
```

If the hash is malformed the app treats admin login as **not configured** (HTTP 503 from the login route, and one `ADMIN_PASSWORD_HASH has an invalid format` line in the logs; the value is never logged). Checked with Next.js's real env loader; whether Vercel's own environment-variable storage expands `$` is **not verified**: after setting it there, look for `ok  ADMIN_PASSWORD_HASH has the expected format` in the build log.

`npm run check-env -- local` validates the variables in the **process environment** (what Vercel provides at build time; it also runs automatically in the Vercel build log). It does **not** read `.env.local`. It never prints values.

Never commit `.env.local` or any real secret. `.gitignore` excludes `.env*` (except `.env.example`).

## Migration strategy

Migrations are plain SQL files in `prisma/migrations/`, applied in order by `prisma migrate deploy`. Prisma records each one in `_prisma_migrations` and takes a PostgreSQL advisory lock while applying, so two builds should not apply the same migration twice.

**Rules**

1. Change `schema.prisma`, then `npm run db:migrate:dev -- --name <what_changed>` **against a local database only**. Read the generated SQL. The initial migration contains hand-written triggers, CHECKs and a sequence that Prisma will not regenerate: never remove them.
2. Never edit a migration that has been applied anywhere shared. Add a new one. (The initial migration was edited twice before any shared database existed; that is no longer allowed once one does.)
3. Never run `migrate dev`, `migrate reset` or `db push` against a shared database.
4. Migrations must work for an ordinary owner role: no `CREATE SCHEMA/DATABASE/EXTENSION/ROLE`, no `GRANT`. A test enforces this (a `CREATE SCHEMA IF NOT EXISTS "public"` line fails for a role without database-level CREATE).
5. Make risky changes in steps (expand, deploy code, contract).
6. There are no down-migrations. Roll forward with a fix, or restore from a backup. Back up before applying anything to production.
7. `npm run db:check-drift` fails if `schema.prisma` and the migrations disagree. The test suite runs the same check.

**Where migrations run**

| Environment | How |
| --- | --- |
| Local | `npm run db:migrate:deploy` |
| CI | Tests apply every migration to an empty database and check idempotence and drift |
| Vercel Preview | Opt-in: `RUN_DB_MIGRATIONS=1` on the **Preview** environment only, with a Preview-only direct URL (`DIRECT_URL`, or the Neon integration's `DATABASE_URL_UNPOOLED`; the build log names which one it used, never its value). `scripts/vercel-build.mjs` then runs `prisma migrate deploy` before `next build`; a failed migration fails the build |
| Vercel Production | **Manual**, from a trusted machine, with the production direct URL (`DIRECT_URL` or `DATABASE_URL_UNPOOLED`). The build refuses to migrate production unless `ALLOW_PRODUCTION_MIGRATIONS=1` is also set |

**Which URL do migrations use?** First non-blank of `DIRECT_URL`, then `DATABASE_URL_UNPOOLED`. `DIRECT_URL` always wins when both are set. With neither, local commands fall back to `DATABASE_URL`, but a build with `RUN_DB_MIGRATIONS=1` refuses to run (it never migrates through the pooled URL). One shared module (`scripts/lib/direct-url.mjs`) decides this for the Prisma CLI and the build guards, so they cannot disagree.

**Migration target guard.** `RUN_DB_MIGRATIONS=1` also requires `EXPECTED_DB_ENDPOINT`: the endpoint id (Neon: the `ep-...` start of the host name, the first part of the host name in the branch's connection details) of the one database a build may migrate. The build compares it with the host of the URL migrations really use (`DIRECT_URL`, else `DATABASE_URL_UNPOOLED`) and refuses on a mismatch, on a missing value, or when the migration host is a `-pooler` host. If `EXPECTED_DB_ENDPOINT` is set while migrations are off, the build still verifies the URLs (and that `DATABASE_URL` is on the same endpoint) and fails on a mismatch without touching any database, so a READY deployment proves the target before you ever enable migrations. It is an id, not a secret, and the messages never print a URL, user or password (`scripts/lib/migration-target.mjs`).

**Check which database a variable points to before turning migrations on.** The Neon integration writes `DATABASE_URL_UNPOOLED` for every environment it is connected to. If the *Production* Neon resource is ever connected to the *Preview* environment, a Preview build with `RUN_DB_MIGRATIONS=1` would migrate the **Production** database. Keep Preview on its own Neon database or branch (see `docs/DEPLOYMENT.md`).

By default (no flag), a build never touches any database. All previews share one Preview database unless you give each branch its own; a destructive migration in one branch can break another branch's preview.

## Deploying to Vercel

**Not deployed and not verified.** At the time of writing no Vercel project, hosted database or GitHub Actions run exists for this repository. The full, step-by-step guide (creating separate Preview and Production databases, exact environment variables, migrations, and a verification checklist) is in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

Short version of the required variables (every one the code reads):

| Variable | Preview | Production |
| --- | --- | --- |
| `DATABASE_URL` (pooled, `sslmode=verify-full`) | required | required |
| Direct URL, owner role, migrations only: `DIRECT_URL`, **or** `DATABASE_URL_UNPOOLED` when `DIRECT_URL` is not set (the Neon integration sets the latter) | required if `RUN_DB_MIGRATIONS=1` | required for manual migrations |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` | required | required |
| `RUN_DB_MIGRATIONS` | `1` (optional) | leave unset |
| `ALLOW_PRODUCTION_MIGRATIONS` | leave unset | leave unset |
| `DATABASE_POOL_MAX` | optional | optional |

Preview and Production must use **different databases and different secrets**. After a deploy, `GET /api/health` must return `{"status":"ok","database":"up","schema":"ok"}`; `"schema":"missing"` means migrations were not applied to that database.

### Database connections on Vercel

- One `pg` pool per function instance (default 5 connections, `DATABASE_POOL_MAX`), 10 second idle timeout, created lazily so `next build` needs no database.
- The pool is registered with `attachDatabasePool` from `@vercel/functions`, which Vercel documents for releasing idle connections before Fluid Compute suspends a function. It does nothing outside Vercel's runtime.
- Use the provider's **pooled** string at runtime and the **direct** string for migrations. The adapter does not name prepared statements, and transactions stay on one connection, so a transaction-mode pooler should work. That has not been tested against a real pooler.
- Prisma 7 runs engine-free (query compiler in WebAssembly, embedded as JavaScript), so no native engine binary has to be shipped. A traced standalone bundle was run in isolation locally and served health, login and create.


## Security design

**Authentication and sessions**
- Passwords: scrypt with a per-hash salt, constant-time compare. No default credentials; an unconfigured deployment cannot log in.
- Cookie: `HttpOnly`, `SameSite=Strict`, `Secure` and the `__Host-` prefix in production (no Domain, Path=/). 8 hour absolute lifetime. A new session id is issued at every login.
- The cookie holds a signed token containing a session id. Every page and API handler also checks a **server-side session row**, so logout and expiry take effect immediately. The proxy only checks the signature (cheap, optimistic); it is never the only check, and a test enforces that every admin page and route calls its own check.
- `__Host-` cookies need HTTPS. `next dev` uses a plain cookie name so http://localhost works. If a browser rejects the production cookie on http://localhost, use HTTPS or `next dev`.

**CSRF / origin validation** (all writes, including login and logout)
- `Origin` header must be present and equal the request origin.
- If the browser sends `Sec-Fetch-Site`, it must be `same-origin`.
- Body must be `application/json` (a plain HTML form cannot send that).
- Cookie is `SameSite=Strict`.

**Login rate limiting** (shared, in Postgres, survives restarts and works across serverless instances)
- 5 attempts per IP per 15 minutes, 30 per 15 minutes across all IPs. Counted before the password check. A success clears that IP's counter.
- IPs are HMAC-hashed before storage.
- Trade-off: the global limit means an attacker can lock the (single) admin out for up to 15 minutes. That is deliberate: it stops distributed guessing.
- The IP is the first `x-forwarded-for` entry. Vercel's docs state it overwrites that header to prevent spoofing. `x-real-ip` is only a fallback and never takes priority. Behind any other proxy, make sure it overwrites `x-forwarded-for`, or the per-IP limit can be bypassed (the global limit still holds).
- If the database is down, login fails closed.

**Headers**
- `Content-Security-Policy` per request with a nonce and `strict-dynamic`; no `unsafe-inline`/`unsafe-eval` in production; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `connect-src 'self'`. API responses get `default-src 'none'`.
- HSTS (2 years, includeSubDomains, no preload), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (camera, mic, geolocation, payment, usb off), COOP/CORP same-origin, `Cache-Control: no-store` (build assets excluded).
- Because of the nonce, **every page is rendered per request** (no static pages). Do not use React `style={...}` attributes: `style-src` has no `unsafe-inline`.
- Verified in a real headless Chromium run against the production build: login, create, status change, logout and cookie replay all worked with zero CSP violations.

**Data**
- Text fields that look like a PAN or Aadhaar number are rejected. This is a guard rail, not a compliance control: it can miss formats and can block a harmless 12-digit number.
- Only fictional name, email, product, amount and purpose are stored. No documents, no identity numbers.

## Checks and CI

```bash
export TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/DBNAME'   # throwaway database
npm run check        # lint + typecheck + tests
npm run build
npm run audit:gate   # dependency audit gate
```

- Database tests create a random schema per test file, apply the real migrations, and drop it afterwards. Point `TEST_DATABASE_URL` only at a throwaway database.
- Without `TEST_DATABASE_URL`, locally, the PostgreSQL suites are reported as **skipped** in the summary.
- When `CI` or `REQUIRE_DB_TESTS` is set, a missing, empty or unreachable test database is a **failure** (`tests/db-required.test.ts`). Checked locally for: unset, empty, unreachable host, and wrong credentials.
- `.github/workflows/ci.yml` runs on **every push to any branch, every pull request, and manually**. It starts a PostgreSQL 16 service, verifies it is reachable, then runs lint, typecheck, `npm run test:ci` (Vitest plus a gate that fails on any skipped, todo or failed test), build, and `npm run audit:gate`.
- It has not run on GitHub yet. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#9-github-actions).

## Dependency audit

| Scope | Result |
| --- | --- |
| Production dependencies (`npm audit --omit=dev`) | **0 vulnerabilities** |
| Whole tree incl. dev tools (`npm audit`) | **5 high**, one dev-only chain ending in `braces` (GHSA-vfj7-8cjw-p6xm). **No fixed version exists.** |

The five are not shipped, and are pinned by `npm run audit:gate` so nothing new can appear unnoticed. Prisma's own pinned `mysql2` and `deepmerge-ts` advisories are fixed with `overrides`. Full details, the reasons the npm-suggested downgrade was rejected, and how to re-check: **[docs/dependency-audit.md](docs/dependency-audit.md)**.


## Known limitations

- One admin account from env vars. No MFA, no roles, no password reset.
- Not verified on a real Vercel deployment, hosted database or GitHub Actions run (see docs/DEPLOYMENT.md).
- No Content-Security-Policy reporting endpoint.
- Rate limiter is a fixed window (a burst at a window boundary can briefly allow up to 2x).
- No applicant-facing flow, no document upload, no real verification provider. Out of scope for this prototype.
