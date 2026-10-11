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
| `/admin`, `/admin/applications/new`, `/admin/applications/[id]` | admin | Dashboard, create, detail + status + history |
| `GET /api/health` | public | `{status, database}` only. 503 if the database is unreachable |
| `POST /api/admin/login` | public | Sign in (rate limited) |
| `POST /api/admin/logout` | cookie | Revokes the session server-side |
| `GET, POST /api/admin/applications` | admin | List / create |
| `GET /api/admin/applications/[id]` | admin | Detail + history |
| `POST /api/admin/applications/[id]/status` | admin | Change status |

## Architecture

| File | Role |
| --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/` | Data model and SQL migrations (incl. hand-written triggers and CHECKs) |
| `prisma.config.ts` | Migration connection (`DIRECT_URL`, falling back to `DATABASE_URL`) |
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
cp .env.example .env.local               # then fill in the placeholders
```

You need a PostgreSQL database (tested on 16). For example with Docker (pick your own password; do not reuse a real one):

```bash
docker run --name dfk-pg -e POSTGRES_PASSWORD='choose-a-local-password' -e POSTGRES_DB=dfk -p 5432:5432 -d postgres:16
# DATABASE_URL=postgresql://postgres:choose-a-local-password@localhost:5432/dfk
```

Then:

```bash
npm run db:migrate:deploy                                # apply migrations
npm run hash-password -- 'a-long-password-you-choose'    # paste output into ADMIN_PASSWORD_HASH
openssl rand -base64 48                                  # paste into SESSION_SECRET
npm run dev
```

Never commit `.env.local` or any real secret. `.gitignore` excludes `.env*` (except `.env.example`).

## Migration strategy

Migrations are plain SQL files in `prisma/migrations/`, applied in order by `prisma migrate deploy`. Prisma records each one in `_prisma_migrations` and takes a Postgres advisory lock, so two builds cannot apply the same migration twice.

**Rules**

1. Change `schema.prisma`, then `npm run db:migrate:dev -- --name <what_changed>` **against a local database only**. Read the generated SQL. Keep the hand-written section of the init migration (triggers, CHECKs, sequence) in mind: Prisma will not recreate it.
2. Never edit a migration that has been applied anywhere shared. Add a new one.
3. Never run `migrate dev`, `migrate reset` or `db push` against a shared database.
4. Make risky changes in steps (expand, deploy code, contract): add nullable column, ship code that writes it, backfill, then tighten or drop.
5. There are no down-migrations. Roll forward with a fix, or restore from a backup. Take a backup/snapshot before applying anything to production.
6. `npm run db:check-drift` fails if `schema.prisma` and the migrations disagree. The test suite runs the same check.

**Where migrations run**

| Environment | How |
| --- | --- |
| Local | `npm run db:migrate:deploy` |
| CI | Tests apply every migration to an empty database and check idempotence and drift |
| Vercel Preview | Opt-in: set `RUN_DB_MIGRATIONS=1` on the **Preview** environment only, with a Preview-only `DIRECT_URL`. `scripts/vercel-build.mjs` then runs `prisma migrate deploy` before `next build` |
| Vercel Production | **Manual**: run `npm run db:migrate:deploy` from a trusted machine with the production `DIRECT_URL`, then deploy. The build refuses to migrate production unless `ALLOW_PRODUCTION_MIGRATIONS=1` is also set |

By default (no flag), a build never touches any database.

Caveat: all previews share one Preview database unless you give each branch its own. A destructive migration in one branch can break another branch's preview. A database provider with branching (for example Neon) avoids this.

## Vercel deployment checklist

Nothing below has been done or verified from this repository. At the time of writing, no Vercel project, database or deployment could be found for it. Treat each line as a to-do.

1. Create a hosted PostgreSQL database (Vercel Marketplace or any provider). Use **separate databases** for Preview and Production.
2. Import `kumarraaz/demo-finance-kyc` into Vercel. `vercel.json` sets `npm ci` and `npm run vercel-build`. Node 22.
3. Set environment variables (Project Settings > Environment Variables). Mark all of them **Sensitive**.

| Variable | Preview | Production | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | required | required | Provider's **pooled** connection string |
| `DIRECT_URL` | required if migrating | required for manual migrations | **Non-pooled** string. Never share Preview's with Production |
| `ADMIN_USERNAME` | required | required | |
| `ADMIN_PASSWORD_HASH` | required | required | From `npm run hash-password` |
| `SESSION_SECRET` | required | required | 32+ random chars. Use a different value per environment |
| `RUN_DB_MIGRATIONS` | `1` (optional) | leave unset | |
| `ALLOW_PRODUCTION_MIGRATIONS` | leave unset | leave unset | |
| `DATABASE_POOL_MAX` | optional | optional | Default 5 per instance |

4. Apply migrations (see table above) before the first request, or the app will error on every query.
5. After a deploy, check `GET /api/health`. Expect `{"status":"ok","database":"up",...}`. A `503` means the app cannot reach the database.
6. Sign in once and create a demo application to confirm writes work.
7. Preview URLs are public unless Vercel Deployment Protection is on. This app is a demo with no real data, but keep protection enabled.

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
- The IP comes from `x-real-ip` / `x-forwarded-for`. Vercel sets these itself. Behind any other proxy, make sure it overwrites them, or the per-IP limit can be bypassed (the global limit still holds).
- If the database is down, login fails closed.

**Headers**
- `Content-Security-Policy` per request with a nonce and `strict-dynamic`; no `unsafe-inline`/`unsafe-eval` in production; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `connect-src 'self'`. API responses get `default-src 'none'`.
- HSTS (2 years, includeSubDomains, no preload), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (camera, mic, geolocation, payment, usb off), COOP/CORP same-origin, `Cache-Control: no-store` (build assets excluded).
- Because of the nonce, **every page is rendered per request** (no static pages). Do not use React `style={...}` attributes: `style-src` has no `unsafe-inline`.
- Verified in a real headless Chromium run against the production build: login, create, status change, logout and cookie replay all worked with zero CSP violations.

**Data**
- Text fields that look like a PAN or Aadhaar number are rejected. This is a guard rail, not a compliance control: it can miss formats and can block a harmless 12-digit number.
- Only fictional name, email, product, amount and purpose are stored. No documents, no identity numbers.

## Checks

```bash
export TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/DBNAME'   # throwaway database
npm run check        # lint + typecheck + tests
npm run build
```

- Database tests create a random schema per test file, apply the real migrations, and drop it afterwards. Point `TEST_DATABASE_URL` only at a throwaway database.
- Without `TEST_DATABASE_URL` the database tests are **skipped locally** (and say so). In CI (`CI=1`) a missing `TEST_DATABASE_URL` is a test **failure**.
- `.github/workflows/ci.yml` runs lint, typecheck, tests (with a Postgres 16 service), build, and `npm audit --omit=dev --audit-level=high`.

## Dependency audit

| Scope | Result |
| --- | --- |
| Production dependencies (`npm audit --omit=dev`) | **0 vulnerabilities** |
| Everything incl. dev tooling (`npm audit`) | **5 high**, all one chain: `eslint-config-next` > `@next/eslint-plugin-next` > `fast-glob` > `micromatch` > `braces` |

- **Fixed with `overrides`:** Prisma 7.10.0's CLI pins `mysql2@3.15.3` (two advisories) and `deepmerge-ts@7.1.5` (stack exhaustion). Overridden to `mysql2@^3.24.5` (same major) and `deepmerge-ts@^8.0.2`. Verified with the real Prisma CLI: `generate`, `migrate deploy/status/diff` and the migration tests all pass. This project only uses PostgreSQL, so the MySQL code path is unused anyway. Re-check these overrides when upgrading Prisma, and remove them once Prisma ships fixed versions.
- **Not fixable yet:** `braces` (GHSA-vfj7-8cjw-p6xm, deeply nested brace patterns cause stack exhaustion / DoS). Affected range is `<=3.0.3` and 3.0.3 is the newest published version, so no patched release exists. `npm audit fix --force` proposes downgrading to `eslint-config-next@14.2.35`: that is two majors older, targets ESLint 7/8 (this repo uses ESLint 9 flat config) and Next 14, so it was rejected. Risk assessment: it is reachable only from the lint tool (`npm ls --omit=dev braces` is empty), it is not in the deployed bundle, and exploiting it needs attacker-controlled glob patterns, which the lint plugin does not take. Re-check when `fast-glob`/`micromatch`/`braces` publish a fix.
- Prisma's `latest` npm tag currently points to an `8.0.0-rc` pre-release with a different toolchain and no matching `@prisma/client@8`; it was not adopted.

## Known limitations

- One admin account from env vars. No MFA, no roles, no password reset.
- Not verified on a real Vercel deployment (see checklist).
- No Content-Security-Policy reporting endpoint.
- Rate limiter is a fixed window (a burst at a window boundary can briefly allow up to 2x).
- No applicant-facing flow, no document upload, no real verification provider. Out of scope for this prototype.
