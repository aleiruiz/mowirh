# MowiHR — Phase 1: Foundation

Last updated: Oct 20, 2026

Phase 1 of the [work plan](work-plan.md) builds what every later module depends on: the project skeleton, the data model's ground rules, sign-in, roles, languages and CI. How it works is in [architecture.md](architecture.md); how to run it is in [runbook.md](runbook.md).

**Done when** (work plan): a staging user can sign in, gets the right role, and every change shows in the audit log.

## Scope

| Deliverable | Status |
| --- | --- |
| Next.js + NestJS project in one repository | Done |
| PostgreSQL schema with soft delete and audit log | Done: areas, employees, role assignments, sessions, audit log |
| Hard deletes impossible, audit log append-only | Done, enforced by database triggers and privileges, with tests |
| Google sign-in limited to Mowi's domain | Done; needs the real Workspace client id (phase 0) |
| Roles | Done: five roles, area-scoped leader/board roles, global guard |
| ES/PT/EN | Done: per-person preference, Spanish default |
| CI | Done: format, typecheck, lint, tests against Postgres, build |
| Staging and deploys | **Waiting on phase 0**: AWS account, region and app address |

## Data model so far

| Table | Purpose |
| --- | --- |
| `employees` | One row per person. Corporate email is the sign-in identity. Holds area, leader, country (drives holidays later), status and language. |
| `areas` | Teams. Start as `pending_approval`; the CEO approval flow (phase 3) activates them. Seeded demo areas are active. |
| `role_assignments` | Extra roles per person; leader and board roles carry an area. |
| `sessions` | Server-side sessions; ended by `revoked_at`, never deleted. |
| `audit_log` | Append-only record of every change, sign-in and refusal. |

Contact fields and profile versioning arrive in phase 2 with the profile screens.

## Defaults chosen (change if wrong)

- Nobody is created on first sign-in; HR adds people first. A person missing from MowiHR sees "ask HR for access".
- Sessions last 12 hours.
- Only the super admin grants and removes roles for now, and `super_admin` itself is set only by the seed script. When the approvals engine lands (phase 3), granting a board role may move behind an approval.
- HR and the super admin can read the audit log through the API.
- An area-scoped role only counts while its area is active.

## Needed from phase 0 to finish

- Google Workspace OAuth client id and the exact domain.
- AWS account and region, and the app's address (for example `hr.mowiapp.com`), to stand up staging.
- The CEO's address for the first super admin.
