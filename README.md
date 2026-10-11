# Demo Finance KYC (simulated prototype)

**DEMO ONLY.** All verification is **simulated**. This project does not perform real KYC, must never be given real PAN or Aadhaar data, and never approves or offers a loan. Use fictional data only.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- SQLite via `better-sqlite3`
- Zod for validation, Vitest for tests, ESLint for linting

## Phase 1, milestone 1: admin dashboard + records foundation

- Admin login (signed, expiring, HttpOnly cookie; scrypt password hash; no default credentials)
- Dashboard: counts by status, search, status filter, pagination
- Create fictional demo applications
- Application detail page with status change form and full status history
- Append-only status history (enforced by database triggers)

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
| `/admin` | admin | Dashboard |
| `/admin/applications/new` | admin | Create demo application |
| `/admin/applications/[id]` | admin | Detail, status change, history |
| `GET /api/health` | public | Health check |
| `POST /api/admin/login` | public | Sign in |
| `POST /api/admin/logout` | admin | Sign out |
| `GET, POST /api/admin/applications` | admin | List / create |
| `GET /api/admin/applications/[id]` | admin | Detail + history |
| `POST /api/admin/applications/[id]/status` | admin | Change status |

## Architecture

- `src/proxy.ts`: blocks unauthenticated requests to `/admin/*` and `/api/admin/*`. Pages and route handlers re-check the session themselves.
- `src/lib/session.ts`: HMAC-SHA256 signed token (Web Crypto), 8 hour expiry.
- `src/lib/auth.ts`: config from env, scrypt verify, in-memory login limiter.
- `src/lib/validation.ts`: Zod schemas. Rejects text that looks like a PAN or Aadhaar number.
- `src/lib/db.ts`: SQLite connection and migrations (`PRAGMA user_version`).
- `src/lib/applications.ts`: queries and the status-change transaction.
- `src/lib/status.ts`: statuses, labels, allowed transitions.

## Run locally

```bash
npm install
cp .env.example .env.local        # then fill in the values
npm run hash-password -- 'a-long-password-you-choose'   # paste output into ADMIN_PASSWORD_HASH
openssl rand -base64 48           # paste into SESSION_SECRET
npm run dev
```

Never commit `.env.local` or any real secret. `.gitignore` excludes `.env*` (except `.env.example`) and local database files.

## Checks

```bash
npm run check    # lint + typecheck + tests
npm run build
```

## Security notes

- Writes require a same-origin `Origin` header plus a `SameSite=Strict` cookie.
- Login failures are rate limited **in memory** per instance. This resets on restart and is not shared across instances.
- Security headers are set in `next.config.ts`. There is no Content-Security-Policy yet.
- The PAN/Aadhaar check is a guard rail on text fields, not a guarantee. Do not rely on it as a compliance control.

## Known limitations

- **Vercel / serverless:** SQLite writes to local disk. On Vercel the only writable location is `/tmp`, which is ephemeral and not shared between instances, so data will be lost. Before deploying anywhere real, move to a hosted database (for example Postgres). Local use and a single long-running server are fine.
- Single admin account from env vars. No roles, no per-user audit identity beyond that username.
- No applicant-facing flow, no document upload, no real verification provider. These are out of scope for this milestone.
