# MowiHR

Internal HR web app for Mowi: employee directory and org chart, profiles, time off with holidays per country, payment records, an approvals inbox and a company announcements feed. Replaces WhatsApp and spreadsheets for HR.

## Documents

| Document | Description |
| --- | --- |
| [docs/spec.en.md](docs/spec.en.md) | v1 product spec (English) |
| [docs/spec.es.md](docs/spec.es.md) | Especificación v1 (español) |
| [docs/work-plan.md](docs/work-plan.md) | Phases, timeline, owners and risks |

The screen designs live in the "MowiHR — Diseño v1" design canvas on claude.ai.

## Stack

- Frontend: Next.js (responsive web)
- Backend: NestJS REST API
- Database: PostgreSQL
- Sign-in: Google Workspace, restricted to Mowi's domain
- Infrastructure: AWS (S3 for files, SES for email), separate staging and production
- Languages: Spanish (default), Portuguese, English

## Ground rules

- Nothing is hard-deleted: soft delete everywhere, append-only audit log.
- MowiHR records payments; it never processes them.
- Sensitive changes (promotions, demotions, deactivations, new areas) require approval; nobody approves their own request.
