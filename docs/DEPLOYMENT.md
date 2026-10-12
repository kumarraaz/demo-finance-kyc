# Deployment guide: Vercel + hosted PostgreSQL

> **Status: the steps in this guide have not been completed against a real Vercel project or hosted database.**
> The app is **not** deployment-ready until every item in [Verification](#7-verification-checklist) has passed on a real Preview deployment. Do not use real customer data. The app is a simulated prototype.

### What happened to the first Vercel deployment (root cause)

A Vercel project named `demo-finance-kyc` was created on 2026-10-11 from this repository. Vercel's Production Branch is `main`, and `main` held only a one-line `README.md` (commit `7dc542d`): no `package.json`, no Next.js. Vercel's first Production build of `main` therefore failed (GitHub shows the commit status as `Vercel: failure`). The application lives on the working branch `ccr-1653a651-wm7pqg`, which Vercel had never built, because that branch was pushed before the project existed. The fix is to get the verified application onto `main` through a pull request. Merging to `main` **starts a Production build automatically**, so merge only after a Preview of the same code has been verified (section 7) or you accept an unconfigured Production deployment (login stays disabled until the variables exist, and `/api/health` reports degraded).

Everything below that was checked locally is marked **(tested locally)**. Anything that depends on your provider's current dashboard or CLI is marked **(verify)**.

---

## 1. Decisions to make first

| Decision | Recommendation | Why |
| --- | --- | --- |
| Database provider | Any hosted PostgreSQL 16 (Neon, Supabase, RDS, ...). Steps below are provider-neutral, with a Neon-via-Vercel example. | The code only needs standard PostgreSQL. Tested on 16 only. |
| Preview vs Production | **Two separate databases** with different credentials. Best: two separate provider projects. Acceptable: two separate database branches. Never one shared database. | A Preview build can run migrations and holds test data. Production must be unreachable from Preview credentials. |
| Pooled connection | Use the provider's **pooled** string for `DATABASE_URL` and the **direct** string for `DIRECT_URL`. | Serverless functions open many short connections. Migrations use advisory locks that poolers can break. |

---

## 2. Create two separate databases

### 2a. Provider-neutral steps (do this twice: once for Preview, once for Production)

1. In the provider's console, create a new PostgreSQL project/database. Name it so the environment is obvious, e.g. `dfk-preview` and `dfk-production`.
2. Choose a region close to where the Vercel functions run (Vercel project setting "Function Region"). **(verify)**
3. Create credentials. Preferred: **two roles** per database:
   - an **owner/migrator** role, used only for `DIRECT_URL`;
   - a **runtime** role with only the privileges the app needs, used for `DATABASE_URL` (SQL in [section 3](#3-optional-hardening-a-least-privilege-runtime-role)).
   If your provider only gives you one role, use it for both and accept that the runtime can drop the audit triggers.
4. Copy two connection strings from the provider console:
   - **pooled** (host usually contains `pooler`, or port `6543`) -> `DATABASE_URL`
   - **direct** (no pooler) -> `DIRECT_URL`
5. Make sure both strings end with `sslmode=verify-full`. Add it if the provider gave `sslmode=require`. See [TLS note](#tls-note).
6. Do not paste these strings into chat, issues, commits or the README. You will paste them only into Vercel (step 4) or your shell.

### 2b. Example: Neon through Vercel's Marketplace **(verify each step in the current UI/CLI)**

Vercel's docs describe `vercel install neon` as provisioning a resource, connecting it to the linked project and pulling credentials into `.env.local`, and `vercel integration resource connect <resource> --environment <env>` as scoping a resource to specific environments.

```bash
npm i -g vercel
vercel login
vercel link                                   # link this folder to the Vercel project
```

Create **two** resources and scope each to exactly one environment:

```bash
vercel install neon                           # follow the prompts; name it dfk-preview
vercel integration resource connect dfk-preview -e preview
# repeat for production with a second resource:
vercel install neon                           # name it dfk-production
vercel integration resource connect dfk-production -e production
```

Check afterwards in Vercel > Project > Settings > Environment Variables that:

- the Preview variables point at the Preview database only, and the Production variables at the Production database only;
- `DATABASE_URL` is the **pooled** string and you have a `DIRECT_URL` with the **unpooled** string. The integration may use different variable names (for example `DATABASE_URL_UNPOOLED`). I could not confirm the names from Vercel's docs. If they differ, add `DIRECT_URL` yourself;
- `.env.local` (created by `vercel install`) is git-ignored. It must never be committed.

---

## 3. Optional hardening: a least-privilege runtime role

The append-only audit trail is enforced by triggers. A table **owner** can drop triggers. If the app connects as a role that does not own the tables, it cannot. **(tested locally on PostgreSQL 16 with the real application code: create/list/status change, sessions, rate limiting and the health query all work, and the role cannot drop or disable the triggers, TRUNCATE or DELETE history, or drop tables.)**

Run once per database, **after migrations**, connected as the owner role. Replace `dfk_app` and pick a strong password in the provider console or your shell (never commit it):

```sql
CREATE ROLE dfk_app LOGIN PASSWORD '<generate-a-long-random-password>';
GRANT USAGE ON SCHEMA public TO dfk_app;
GRANT SELECT, INSERT, UPDATE ON "applications" TO dfk_app;
GRANT SELECT, INSERT ON "status_history" TO dfk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "admin_sessions" TO dfk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_limits" TO dfk_app;
GRANT USAGE ON SEQUENCE "applications_id_seq", "status_history_id_seq", "application_reference_seq" TO dfk_app;
```

Use `dfk_app` in `DATABASE_URL`. Keep the owner role only in `DIRECT_URL`. If a future migration adds tables or sequences, add matching `GRANT`s in that migration's rollout.

---

## 4. Create the Vercel project and set variables

### 4a. Import the repo

1. Vercel dashboard > Add New > Project > import `kumarraaz/demo-finance-kyc`.
2. Framework: Next.js (auto-detected). `vercel.json` sets `npm ci` and `npm run vercel-build`. Node version comes from `package.json` (`engines.node = 22.x`, which Vercel's docs list as the supported override form).
3. **Deployment Protection:** open Project > Settings > Deployment Protection and confirm Preview deployments are protected. I could not confirm the default from Vercel's docs, so check it. The app contains no real data, but there is no reason for previews to be public.
4. Do not deploy yet. Add the variables first.

### 4b. Generate the secrets locally

```bash
npm run hash-password -- 'a-long-unique-password-for-this-environment'   # prints scrypt$...  (this is ADMIN_PASSWORD_HASH)
openssl rand -base64 48                                                 # this is SESSION_SECRET
```

Use **different** `ADMIN_PASSWORD_HASH` and `SESSION_SECRET` values for Preview and Production. Copy each result straight into Vercel. Do not save them in a file in the repo.

**About `$` in the hash.** The hash is `scrypt$<salt>$<hash>`. Next.js's `.env.local` loader expands `$name` and truncates it to `scrypt` unless every `$` is written as `\$` (tested; this only applies to `.env.local`). Whether Vercel stores a pasted value literally is **not verified**. The app now treats a malformed hash as "admin login not configured" (login route returns 503, one value-free line in the runtime logs), and the Vercel build log prints `ok  ADMIN_PASSWORD_HASH has the expected format` or an `ERROR`. Check that line after you set the variable.

### 4c. Exact variables

These are every variable the code reads (checked by searching the source).

| Variable | Preview | Production | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | **required** | **required** | Pooled string, `sslmode=verify-full`. Different database per environment. |
| `DIRECT_URL` | required if `RUN_DB_MIGRATIONS=1` | required for manual migrations | Direct string, owner role. Never shared across environments. Not used by the running app. |
| `ADMIN_USERNAME` | **required** | **required** | Avoid `admin` in Production. |
| `ADMIN_PASSWORD_HASH` | **required** | **required** | Output of `npm run hash-password`. Not the plain password. |
| `SESSION_SECRET` | **required** | **required** | 32+ characters. Different per environment. Changing it signs everyone out. |
| `RUN_DB_MIGRATIONS` | `1` (optional, see section 5) | **leave unset** | Opt-in "migrate during build". |
| `ALLOW_PRODUCTION_MIGRATIONS` | **leave unset** | **leave unset** | Only to override the build's refusal to migrate production. Do not set. |
| `DATABASE_POOL_MAX` | optional | optional | Connections per function instance. Default 5. |

Set by Vercel automatically (do not set yourself): `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_REGION`, `NODE_ENV`. Test-only (never in Vercel): `TEST_DATABASE_URL`, `REQUIRE_DB_TESTS`, `CI`.

### 4d. Add them

Dashboard route: Project > Settings > Environment Variables > Add. For each secret choose **only** the environment it belongs to (Preview *or* Production) and mark it **Sensitive**. Vercel's docs say sensitive variables can only be created for Preview and Production and cannot be read back afterwards.

CLI route (prompts for the value, so it does not land in shell history):

```bash
vercel env add DATABASE_URL preview --sensitive
vercel env add DIRECT_URL preview --sensitive
vercel env add ADMIN_USERNAME preview
vercel env add ADMIN_PASSWORD_HASH preview --sensitive
vercel env add SESSION_SECRET preview --sensitive
vercel env add RUN_DB_MIGRATIONS preview            # value: 1

vercel env add DATABASE_URL production --sensitive
vercel env add DIRECT_URL production --sensitive
vercel env add ADMIN_USERNAME production
vercel env add ADMIN_PASSWORD_HASH production --sensitive
vercel env add SESSION_SECRET production --sensitive
```

Branch-specific Preview values (for example a different database for one branch) use `vercel env add DATABASE_URL preview <branch-name>`. A branch-specific value overrides the general Preview one for that branch.

Review with `vercel env ls preview` and `vercel env ls production`. Check that no variable is attached to both environments by accident.

---

## 5. Apply migrations

Migration files live in `prisma/migrations`. Prisma takes a PostgreSQL advisory lock while applying, so two simultaneous builds cannot both apply the same migration.

**Preview (automatic, opt-in).** With `RUN_DB_MIGRATIONS=1` on Preview, `scripts/vercel-build.mjs` runs `prisma migrate deploy` before `next build`. A failed migration fails the build, so a broken schema never gets a working deployment. Without that variable, no build ever touches a database.

**Preview or Production (manual).** From a trusted machine, with the direct owner URL for the target database in your shell only:

```bash
export DIRECT_URL='<paste the DIRECT connection string for THIS environment>'
npm run db:migrate:status      # shows what is pending
npm run db:migrate:deploy      # applies it
unset DIRECT_URL
```

Before any Production migration: take a backup/snapshot in the provider console and confirm which database `DIRECT_URL` points at. The build refuses to migrate production unless `ALLOW_PRODUCTION_MIGRATIONS=1` is also set (**tested locally**).

`vercel env pull` / `vercel env run` may not expose Sensitive variables (they are non-readable by design). Do not rely on them for migrations. Copy the connection string from the provider console instead.

There are no down-migrations. To undo a bad change, ship a forward fix or restore from a provider backup/point-in-time recovery.

---

## 6. Deploy

Push to the branch (or open a PR once you are ready). Vercel builds a Preview. In the build log look for:

1. `Environment check (preview):` followed by `ok` lines and no `ERROR` lines (values are never printed);
2. `Applying database migrations (VERCEL_ENV=preview)...` then either the migration name or `No pending migrations to apply.`;
3. `Compiled successfully`.

---

## 7. Verification checklist

Do these on the Preview deployment, in order. Stop at the first failure.

- [ ] **CI is green** on the branch in GitHub > Actions (see [section 9](#9-github-actions)).
- [ ] **Build log** shows the three items from section 6.
- [ ] **Health:** `vercel curl /api/health --deployment <preview-url>` (this handles Deployment Protection) returns HTTP 200 and `{"status":"ok","database":"up","schema":"ok",...}`.
  - `"database":"down"` -> the app cannot reach the database (check `DATABASE_URL`, TLS, firewall/IP allow-list).
  - `"schema":"missing"` -> migrations were not applied to *this* database.
- [ ] **Sign in** at `/admin/login` with the Preview credentials. Wrong password gives a generic error. After 5 wrong attempts you get 429.
- [ ] **Create** a demo application using fictional data. Entering something that looks like a PAN (e.g. `ABCDE1234F`) in Purpose is rejected.
- [ ] **Change status** to `in_review`, then to `simulated_check_passed`. The page says SIMULATED. History shows each step.
- [ ] **Sign out**, then press Back. You are sent to the login page.
- [ ] **Headers:** `curl -I <preview-url>/admin/login` (via `vercel curl`) shows `content-security-policy` with a `nonce-`, `strict-transport-security`, `x-frame-options: DENY`.
- [ ] **Browser console** on the login and dashboard pages shows no Content-Security-Policy errors.
- [ ] **Separation:** the application you created is **not** visible in Production's database (check in the provider console, not by signing in to Production).
- [ ] **Runtime logs** (`vercel logs --deployment <id> --level error`) show no `Connection terminated` or TLS errors.

Only after all of this passes can the Preview be called working. Production needs its own run of this list.

---

## 8. TLS note

`pg` (the runtime driver) currently treats `sslmode=require` as `verify-full` (certificate and host name are checked) and prints a security warning that this changes in a future major version. Write `sslmode=verify-full` explicitly. **(tested locally against a server with a self-signed certificate: `pg` rejected `require` and `verify-full`; Prisma's migration CLI accepted all modes.)** Consequences:

- Providers with publicly trusted certificates (most hosted services) work with `verify-full`.
- A provider that uses a private CA will fail at runtime with a certificate error and `/api/health` will show `"database":"down"`. This repository does not yet support supplying a custom CA bundle. If you hit this, that is a code change, not a configuration mistake.
- The Prisma CLI (used for migrations) did not verify the certificate in my test, so migration traffic is encrypted but may not be authenticated. Run migrations from a network you trust.

---

## 9. GitHub Actions

The workflow `.github/workflows/ci.yml` runs on **every push to any branch**, **every pull request** and manual dispatch. It starts a throwaway PostgreSQL 16 service, and fails (never skips) if that database is missing or unreachable.

Check it ran: GitHub > Actions > CI. If there is no run:

1. Repository Settings > Actions > General: make sure Actions are allowed for this repository.
2. Push a new commit or use "Run workflow" on the CI workflow.

After the first successful run, you can add branch protection on `main` (Settings > Branches > Add rule) and require the **CI / check** status check. The check only appears in the list after it has run once.

Known limits: the actions are referenced by tag (`actions/checkout@v4`, `actions/setup-node@v4`), not pinned to commit hashes. Pinning is stronger against supply-chain attacks, but I could not look up the correct hashes from here and will not guess them.

---

## 10. What has not been verified

- That a Vercel project, a hosted database, or a deployment exists, or that any build succeeded on Vercel.
- Behaviour behind a real connection pooler (PgBouncer or provider equivalent). Prisma's `pg` adapter only names (server-side prepares) statements when a `statementNameGenerator` option is set, and this project does not set one (checked in the adapter source), which is what transaction-mode poolers need. Interactive transactions stay on one connection. Both should be pooler-friendly, but this is unconfirmed against a real pooler.
- Prisma's query engine on Vercel's runtime. Locally, the traced standalone bundle ran in isolation with the Prisma query compiler, `pg` and the pool, and passed health, login and create. That is strong evidence for file tracing but is not Vercel itself.
- The first real GitHub Actions run.
