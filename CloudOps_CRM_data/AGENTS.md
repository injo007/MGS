# AGENTS.md — CloudOps CRM

## Mission
Build a production-grade, self-hostable, multi-user VPS & Cloud Provider Operations CRM that replaces the existing spreadsheet workflow.

## Primary users
- Admin: full access, user management, provider decisions, imports/exports, infrastructure, analytics, settings, audit logs.
- Mailer: restricted access to assigned providers/servers/IPs and daily operational logging.
- Implement extensible RBAC with granular permissions; do not hard-code only two roles.

## Preferred stack
- Next.js 16+ / React 19+ / TypeScript strict mode
- Tailwind CSS + shadcn/ui + Radix UI + Lucide
- PostgreSQL + Drizzle ORM
- Zod + React Hook Form
- Recharts
- Secure session-based auth
- S3-compatible object storage abstraction
- Background jobs via Inngest or BullMQ/Redis
- Docker + docker-compose for first-class self-hosting
- Playwright for E2E tests

## Design
Create an original premium SaaS CRM UI inspired by modern affiliate/analytics dashboards. The reference level of polish is:
https://dribbble.com/shots/25348555-Trackit-Affiliate-Management-Platform

Do not copy copyrighted assets or exact layouts.

## Core modules
1. Dashboard
2. Providers CRM
3. Outreach
4. Provider Responses
5. Follow-ups
6. Tasks
7. Servers
8. IP Addresses
9. Daily Sending
10. Reports & Analytics
11. Spreadsheet/JSON Import & Export
12. Users / Roles / Permissions
13. Audit Log
14. Settings

## Provider fields
- provider_name
- website
- support_email
- sales_email
- country
- region
- contact_status
- response_status
- final_decision
- date_first_contacted
- last_contact_date
- next_follow_up_date
- port_25_status
- ptr_rdns_availability
- ipv4_availability
- ipv6_availability
- mail_server_allowed
- sending_restrictions
- daily_limit
- hourly_limit
- starting_price
- currency
- billing_method
- owner
- comments

## Canonical statuses
Contact Status:
- Not Contacted
- Ready to Contact
- Contacted
- Follow-up Due
- Closed

Response Status:
- Not Sent
- No Response Yet
- Replied
- Needs Follow-up

Final Decision:
- Pending
- Accepted
- Denied
- Prohibited Sending - Close
- Not Suitable

Port 25 Status:
- Unknown
- Open
- Blocked by Default
- Can Be Opened on Request
- Permanently Blocked

PTR/rDNS:
- Unknown
- Available
- Not Available
- Available on Request

## Data import
Initial seed/import JSON files are under ./data.

Import order:
1. providers.json
2. outreach.json
3. provider_responses.json
4. servers.json
5. ip_addresses.json
6. daily_sending.json
7. tasks.json

Use provider_name as the temporary initial linking key when no database ID exists yet. During import, resolve or create the Provider record first, then replace name-based links with foreign keys.

Do not fabricate missing data. Empty or null fields are intentional.

## Import requirements
The finished app must support:
- .xlsx
- .xls
- .csv
- .json

Provide a mapping wizard with preview, validation, duplicate detection, create/update modes, and import history.

## Important operational rules
- Never overwrite outreach history.
- Keep provider responses as immutable historical records with edit audit history.
- Server and IP records are separate normalized entities.
- All sensitive mutations require server-side authorization.
- Every important status/assignment change must be audit logged.
- Support comments and internal notes.
- Support multi-user assignment and ownership.
- Use server-side pagination for large tables.
- Support global search and saved filters/views.

## Data scale target
Design for:
- 10,000+ providers
- 50,000+ servers
- 100,000+ IP addresses
- Millions of daily sending log rows

## Self-hosting
Provide:
- Dockerfile
- docker-compose.yml
- environment variable documentation
- migrations
- backup/restore instructions
- reverse proxy example using Caddy or Nginx

Do not make Vercel mandatory.

## Build order
1. Foundation and design system
2. Database schema + migrations
3. Authentication + RBAC
4. Providers CRM
5. Outreach + responses + follow-ups
6. Servers + IP addresses
7. Daily sending operations
8. Import/export
9. Dashboard and analytics
10. Audit logs, notifications, settings
11. Tests
12. Production hardening and deployment docs

## Acceptance criteria
The result must be a working operational application, not a static mockup.
All dashboard figures must derive from real database records.
All forms require validation and meaningful error states.
All major pages require responsive desktop/tablet/mobile behavior.
Use premium SaaS-level UI polish, loading states, empty states, and accessibility.

## Seed data
Use the JSON files in ./data as initial real CRM seed/import data.
