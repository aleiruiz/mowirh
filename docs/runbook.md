# MowiHR — Runbook

Last updated: Oct 20, 2026

How to run MowiHR locally and what an environment needs. Staging and production hosting on AWS are still to be set up (work plan, phase 0: confirm the account and region); the steps below are what any host must do.

## Local development

Requirements: Node 22, pnpm 10, and PostgreSQL 16 (`docker compose up -d` starts one with the owner role `mowihr_owner`).

```bash
pnpm install
pnpm --filter @mowihr/shared build
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @mowihr/api db:migrate          # creates tables and lets mowihr_app log in locally
pnpm --filter @mowihr/api db:seed -- --demo   # CEO as super admin plus fake HR, leader, board and staff
pnpm dev                                       # API on :4000, web on :3000
```

With `DEV_LOGIN_ENABLED=true` the login page shows a form to sign in as any seeded address, for example `rrhh.demo@mowiapp.com`.

Checks, as CI runs them: `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build`. API tests need a Postgres where `TEST_DATABASE_OWNER_URL` (default `postgres://mowihr_owner@localhost:5432/postgres`; set `PGPASSWORD` if your Postgres needs one) can create databases; they recreate `mowihr_test` on each run.

## Environment variables

**API** (`apps/api/.env.example` documents each one)

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | Required: `development`, `test`, `staging` or `production`. Anything but development/test gets Secure cookies and refuses dev login. |
| `DATABASE_URL` | Connects as `mowihr_app`, never as the owner. |
| `DATABASE_OWNER_URL` | Only for migrations and seeding. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_WORKSPACE_DOMAIN` | The Workspace sign-in client and the only domain allowed. |
| `WEB_ORIGIN` | Exact public origin of the web app, e.g. `https://hr.mowiapp.com`. Writes from any other origin are refused. |
| `TRUST_PROXY_HOPS` | See "Client addresses" below. |
| `DEV_LOGIN_ENABLED` | Must be `false` (or unset) in staging and production. |

**Web:** `API_URL` (server-side address of the API), `GOOGLE_CLIENT_ID`, `GOOGLE_WORKSPACE_DOMAIN`, `DEV_LOGIN_ENABLED`.

## Setting up a new environment

1. Create the database with a dedicated owner role. It does not need to be a superuser, but it needs `CREATEROLE` the first time (or create `mowihr_app` beforehand with `CREATE ROLE mowihr_app NOLOGIN`).
2. Run migrations as the owner: `DATABASE_OWNER_URL=... NODE_ENV=staging pnpm --filter @mowihr/api db:migrate`. This creates the `mowihr_app` role without login.
3. As the owner, give the app role a login with a generated password kept in the secrets store, and use it in `DATABASE_URL`:
   ```sql
   ALTER ROLE mowihr_app LOGIN PASSWORD '<generated>';
   ```
4. Seed the CEO: `SEED_SUPERADMIN_EMAIL=<ceo address> SEED_SUPERADMIN_NAME=<name> pnpm --filter @mowihr/api db:seed`. Add `-- --demo` on staging only (it is refused in production).
5. Start the API and the web app; check `GET /health` on the API.
6. Sign in as the CEO and grant HR its role (`POST /role-assignments`; a screen for this arrives with the people module).

## Client addresses

Audit entries record the client IP from Express's `req.ip`. The web app's `/api` rewrite forwards the browser's `X-Forwarded-For` unchanged and does not add its own entry, so:

- Put a load balancer in front of the web app that **overwrites** `X-Forwarded-For` with the real client address.
- Set `TRUST_PROXY_HOPS=1` on the API in that setup. With `0`, every entry records the web server's address.
- Do not expose the web app directly to the internet with `TRUST_PROXY_HOPS>0`, or clients can forge their address.

## Things that are not allowed

- Deleting rows. The database refuses it; if data must go (for example a legal erasure request), anonymize the personal fields with an UPDATE in a reviewed migration and keep the audit trail.
- Running the app as the owner role.
- Testing with real data or a super admin account in production. Use staging with demo data.

## Known limits

- The sign-in rate limit is in memory, per API instance. Move it to a shared store before running more than one instance.
- Sessions last `SESSION_TTL_HOURS` (default 12) with no sliding renewal.
