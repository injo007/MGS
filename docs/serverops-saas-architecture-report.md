# ServerOps CRM SaaS Architecture Report

Date: 2026-07-19

## Executive Summary

The current CloudOps CRM project is a promising internal operations dashboard, but it is not yet a complete production SaaS architecture for replacing Google Sheets as the system of record for provider research, server operations, IP tracking, outreach, and sending statistics.

The project already has the right broad product direction:

- Next.js application shell with authenticated app routes.
- PostgreSQL/Drizzle schema covering providers, outreach, responses, servers, IP addresses, sending logs, tasks, users, roles, permissions, notifications, audit logs, settings, imports, and exports.
- Real seed data imported from the previous spreadsheet-like workflow.
- Operational dashboard with KPI cards, provider status chart, contacts-over-time chart, recent activity, providers requiring action, pipeline overview, sending volume, and server alerts.

The main issue is that the current implementation behaves like a single-team admin tool rather than a reliable SaaS. Before it becomes the real replacement for Google Sheets, the project needs stronger workflow modeling, permission enforcement, import/export safety, data validation, reporting definitions, migrations, and operational guardrails.

Recommended direction: keep the existing Next.js + PostgreSQL + Drizzle base, but refactor the domain layer around explicit ServerOps workflows and build a hardened service/API layer before adding more UI polish.

## Current Project Snapshot

Technology stack:

- Framework: Next.js 16 App Router.
- Frontend: React 19, Tailwind CSS 4, shadcn/Base UI components, Recharts, lucide-react.
- Auth: NextAuth beta credentials provider.
- Database: PostgreSQL through Drizzle ORM.
- Data tooling: JSON seed files, CSV/XLSX import/export helpers.
- Integrations: IMAP email sync, Telegram webhook, OpenRouter/OpenAI-style AI assistant hooks.
- Deployment assets: Dockerfile, docker-compose, cron script.

Current sample data volume:

- Providers: 28.
- Servers: 10.
- IP addresses: 14.
- Outreach records: 3.
- Tasks: 8.
- Daily sending rows: 27.
- Provider responses: 3.

Current schema coverage is broad. The key entities are defined in `src/db/schema/index.ts`:

- `providers`: provider identity, contact status, response status, decision, port 25, PTR, mail policy, billing, ownership, follow-up dates.
- `outreach_logs`: provider outreach attempts and follow-up dates.
- `provider_responses`: response classification and summary.
- `servers`: server lifecycle and billing fields.
- `server_users`: many-to-many assignment of servers to users.
- `ip_addresses`: IP status, PTR, port 25, assigned mailer.
- `sending_logs`: daily sending performance by mailer, provider, server, IP, campaign.
- `tasks`: generic task tracking with related entity pointers.
- `roles`, `permissions`, `role_permissions`, `users`: role-based access foundations.
- `audit_logs`, `notifications`, `imports`, `settings`: operational support tables.

## Original Prompt Interpretation

The original attached prompt was not a full product architecture prompt. It was a precision correction pass for the existing dashboard UI. It asked the builder to avoid redesigning the CRM and instead improve the current dashboard to match a reference image.

Its most important product signals were:

- This product replaces Google Sheets for managing provider and server statistics.
- Real application data must remain the source of truth.
- The dashboard should stabilize around provider outreach, pipeline, and server operations.
- "Ready to Contact" is not a stored business state in every situation; it must be derived carefully.
- Providers requiring action must be based on real operational criteria, not just arbitrary provider ordering.
- The dashboard must keep all status categories visible even when counts are zero.

That prompt was useful for visual correction, but it is not sufficient as a SaaS build specification. This report fills that missing architecture layer.

## Critical Findings

### 1. Authentication Exists, But Authorization Is Not Enforced Consistently

The project defines a permission model in `src/lib/permissions.ts`, including permissions such as `providers.view`, `providers.create`, `servers.edit`, `imports.create`, `exports.create`, and `settings.manage`.

However, most API routes only check that a user is logged in. They do not check whether the user has the correct permission for the action. For example, `src/app/api/providers/route.ts` checks `auth()` for GET and POST, but does not enforce `providers.view` or `providers.create`.

This makes the app unsafe for a multi-user SaaS because any authenticated user may be able to perform actions beyond their role.

Required correction:

- Add a server-side `requirePermission(permission)` helper.
- Enforce permissions in every API route.
- Use the database role/permission tables, not only the JWT role name.
- Add route-level tests for allowed and denied access.

### 2. Import And Export Endpoints Are Not Protected Enough

The import route in `src/app/api/import/route.ts` does not call `auth()` at all. It accepts rows and writes directly to core operational tables.

The export route in `src/app/api/export/route.ts` also does not call `auth()` and can export providers, servers, IP addresses, outreach, sending logs, and tasks.

This is a severe security gap for a SaaS and also risky for an internal tool.

Required correction:

- Require authentication for import and export endpoints.
- Enforce `imports.create` and `exports.create`.
- Record every import/export in audit logs.
- Store import jobs in the `imports` table with status, mapping config, row counts, and error logs.
- Prevent empty `createdById` values during import.
- Validate entity relationships before writing rows.

### 3. The App Has A Permission Model, But No Complete Access-Control Architecture

`roles`, `permissions`, and `role_permissions` exist in the schema, but the runtime app does not consistently use them.

For the SaaS architecture, permission checks must exist at three layers:

- Navigation visibility: hide pages/actions the user cannot use.
- API authorization: enforce every action on the server.
- Data scoping: restrict what records a role can see or edit.

Recommended baseline roles:

- Admin: full access, settings, users, imports, exports, audit.
- Operations Manager: providers, servers, IPs, sending, reports, assignments.
- Researcher: provider discovery, outreach, responses, follow-ups.
- Mailer: assigned servers/IPs, daily sending logs, assigned tasks.
- Viewer: read-only reports and dashboards.

### 4. There Is No Tenant/Organization Boundary

The current schema has users and roles but no `organizations`, `organization_id`, or tenant scoping.

If this is only for one internal team, this is acceptable for version 1. If this is intended to become a real multi-customer SaaS, this is a blocker.

Recommended decision:

- Internal SaaS for one organization: keep single-tenant now, but design with a future `organization_id` migration in mind.
- Multi-customer SaaS: add `organizations`, `memberships`, and `organization_id` to all business tables before production data grows.

Recommended single-tenant compromise:

- Add `workspace_id` or `organization_id` early, even if there is only one default organization.
- Enforce all queries through scoped repository/service functions.

### 5. Workflow States Are Mixed And Need A Canonical Model

The provider model currently splits status across:

- `contactStatus`
- `responseStatus`
- `decision`
- `mailServerAllowed`
- `assignedUserId`
- follow-up dates
- server ownership/active servers

This is a good raw model, but dashboard labels currently mix stored states and derived states. The original prompt specifically warned about inconsistent "Ready to Contact" logic.

Correct business rule:

```ts
isReadyToContact =
  provider.contactStatus === "not_contacted" &&
  provider.decision !== "prohibited_sending" &&
  provider.assignedUserId == null;
```

Recommended architecture:

- Keep raw fields in the database.
- Create a single domain function, for example `deriveProviderWorkflow(provider)`.
- Use that function everywhere: dashboard, provider list, reports, imports, tests, and AI tools.
- Do not duplicate workflow rules in individual React pages.

Canonical provider workflow:

- Research backlog: provider exists but has incomplete contact/policy data.
- Ready to contact: not contacted, not owned, not prohibited.
- Contacted: outreach sent.
- Awaiting reply: outreach sent but no reply after expected delay.
- Follow-up due: next follow-up date is today or earlier.
- Replied: response received but no final decision.
- Negotiating: provider response requires verification, deposit, KYC, support request, or manual decision.
- Accepted: provider can be used.
- Denied: provider rejected or unsuitable.
- Prohibited: provider disallows mail servers/sending.
- Owned/active: accepted provider has active server inventory.
- Closed: no further action.

### 6. Providers Requiring Action Is Not Yet A Real Business Query

The dashboard currently fetches:

```text
/api/providers?pageSize=7&sortBy=lastContactDate&sortOrder=asc
```

That means the dashboard table is based on old contact dates, not a true action queue.

Required correction:

- Build `/api/dashboard/action-queue` or `/api/providers?actionRequired=true`.
- Include providers only when they have a real next action.
- Exclude owned, prohibited, accepted-with-no-open-action, and denied-with-no-open-action records unless a task is explicitly open.

Recommended action queue priority:

1. Open urgent/high tasks due today or overdue.
2. Follow-up due providers.
3. Replied but unresolved providers.
4. Negotiation/KYC/deposit required.
5. Ready to contact providers.
6. Awaiting reply providers beyond SLA.

Each queue row should expose:

- Provider.
- Action reason.
- Current workflow state.
- Owner/assignee.
- Next due date.
- Last contact.
- Recommended next action.

### 7. Reporting Is Currently Dashboard Aggregation, Not A Reporting Layer

The dashboard stats API computes aggregates directly in one route. It is useful, but production reporting needs a clearer model.

Current dashboard stats include:

- Provider counts by contact status and decision.
- Owned providers.
- Active servers.
- Total IPs.
- Task counts.
- Outreach by channel.
- Sending totals.
- Contacts over time.
- Recent audit activity.
- Sending over time.
- Server utilization.

Missing reporting capabilities:

- Date range filtering.
- Team/user filtering.
- Provider category/country filtering.
- Conversion rates by stage.
- Time-to-first-contact and time-to-decision.
- Follow-up SLA compliance.
- Server cost and sending performance per provider.
- IP utilization and issue rates.
- Exportable report snapshots.

Recommended architecture:

- Add a reporting service layer under `src/server/reports`.
- Keep dashboard summaries separate from export/report generation.
- Introduce materialized views later only if performance requires it.
- Define metric formulas in code and test them.

### 8. Database Migrations Are Configured But Missing

`drizzle.config.ts` points to `out: "./drizzle"`, but no migration SQL files were present in the project inspection.

This means the database cannot be reproduced reliably across environments without pushing schema directly.

Required correction:

- Generate initial migrations.
- Commit migration files.
- Stop relying on ad hoc schema push for production.
- Add migration execution to deployment startup or CI/CD.

### 9. API Validation Is Too Light

Several routes accept request bodies and spread them directly into inserts/updates. Provider creation, for example, inserts `...body` plus `createdById`.

Risks:

- Invalid enum values.
- Unexpected fields.
- Wrong numeric/date formats.
- Missing relationship checks.
- Accidental override of fields that should be server-owned.

Required correction:

- Add Zod schemas per entity and action.
- Separate create/update schemas from database row types.
- Normalize dates, numbers, booleans, and enum values at the API boundary.
- Reject unknown fields for sensitive writes.
- Use transactions for multi-table changes.

### 10. Audit Logging Exists But Is Incomplete

The schema has `audit_logs`, and many write routes insert audit records. This is a good foundation.

Gaps:

- Import/export routes are not consistently audited.
- Some integrations and background jobs should log system actions.
- Audit records should include IP address and user agent.
- Status transition history should be easier to reconstruct.

Recommended correction:

- Add `withAudit()` helper for mutations.
- Add status transition events for provider, server, IP, and sending status changes.
- Add a dedicated `provider_status_events` table if workflow history becomes important.

## Target Product Architecture

### Product Modules

The SaaS should be structured around these modules:

1. Dashboard
   - Executive overview.
   - Provider pipeline health.
   - Action queue.
   - Server/IP sending health.
   - Recent activity.

2. Provider Intelligence
   - Provider directory.
   - Contact details.
   - Mail policy research.
   - Port 25/PTR/IPv4/IPv6 capabilities.
   - Pricing and billing notes.
   - Tags, category, country, region.

3. Outreach CRM
   - Outreach logs.
   - Message templates.
   - Follow-up scheduling.
   - Response capture.
   - Provider decision workflow.

4. Server Inventory
   - Provider-owned servers.
   - Plan, location, OS, billing, renewal, cost.
   - Assignment to users/mailers.
   - Server lifecycle statuses.

5. IP Operations
   - IP addresses by server/provider.
   - PTR status.
   - Port 25 status.
   - Assigned mailer.
   - IP warming/blocked/retired lifecycle.

6. Sending Statistics
   - Daily send plans.
   - Actual sends.
   - Successful sends.
   - Bounces, complaints, unsubscribes.
   - Campaign attribution.
   - Operational status.

7. Tasks And Follow-Ups
   - Work queue.
   - Due dates.
   - Related entity links.
   - SLA support.

8. Imports And Exports
   - Google Sheets migration.
   - CSV/XLSX upload.
   - Field mapping.
   - Validation preview.
   - Error handling.
   - Export by entity and report.

9. Reports
   - Provider conversion funnel.
   - Outreach activity.
   - Follow-up SLA.
   - Server/IP utilization.
   - Sending performance.
   - Cost/performance reports.

10. Admin
   - Users.
   - Roles.
   - Permissions.
   - Settings.
   - Integrations.
   - Audit logs.

### Recommended Code Structure

The current app can evolve without changing frameworks. The main improvement is to stop placing core business rules directly inside route handlers and pages.

Recommended structure:

```text
src/
  app/
    (app)/
    api/
  components/
  db/
    schema/
    migrations/
  server/
    auth/
      require-session.ts
      require-permission.ts
    providers/
      provider.schema.ts
      provider.repository.ts
      provider.service.ts
      provider.workflow.ts
    outreach/
    servers/
    ip-addresses/
    sending/
    tasks/
    reports/
    imports/
    audit/
  lib/
    utils.ts
  types/
```

Route handlers should become thin:

- Authenticate.
- Authorize.
- Validate input.
- Call service.
- Return typed response.

Services should own:

- Transactions.
- Business rules.
- Workflow transitions.
- Audit logging.
- Notification triggers.

Repositories should own:

- Database queries.
- Filtering.
- Sorting.
- Pagination.
- Relationship loading.

### Database Architecture

Keep the existing tables, but strengthen them.

Recommended additions:

- `organizations` and `memberships` if multi-tenant SaaS is required.
- `provider_status_events` for workflow transition history.
- `provider_policy_snapshots` if provider mail policy changes over time.
- `import_rows` for row-level import validation and retry.
- `report_exports` for generated reports.
- `notification_preferences` for user-specific alerts.
- `api_keys` if external systems will write sending/server data.

Recommended table changes:

- Add `organization_id` or `workspace_id` to all business tables if multi-tenancy is desired.
- Add `created_by_id` and `updated_by_id` consistently.
- Add `deleted_at` for soft deletion of providers, servers, IPs, campaigns, and tasks.
- Add `last_status_changed_at` to providers, servers, IPs.
- Add unique constraints scoped by organization, for example provider website and IP address.
- Add indexes for dashboard and action queue queries.

### Provider Status Model

Do not rely on one status column to explain the full provider state.

Use raw fields:

- `contactStatus`: outreach lifecycle.
- `responseStatus`: reply lifecycle.
- `decision`: final decision.
- `mailServerAllowed`: policy flag.
- `assignedUserId`: ownership.
- `nextFollowUpDate`: work queue timing.

Then derive display state:

- Ready to Contact.
- Awaiting Reply.
- Follow-up Due.
- Negotiating.
- Accepted.
- Denied.
- Prohibited.
- Owned.

This avoids corrupting stored data and keeps reports consistent.

### Server And IP Operations Model

Servers should track:

- Provider.
- Plan and cost.
- Location.
- Status.
- Purchase/activation/expiration.
- Assigned users.
- Daily send limit.
- Renewal and billing method.

IP addresses should track:

- Provider.
- Server.
- IP version.
- PTR configuration.
- Port 25 status.
- Assigned mailer.
- Warming/active/blocked/retired status.

Operational health should be derived from sending logs:

- No sending data.
- No sends in 24 hours.
- Bounce/complaint threshold exceeded.
- IP blocked or retired.
- Server expired/paused/suspended.

### Sending Statistics Model

Daily sending logs should support:

- One row per date + mailer + provider + server + IP + campaign.
- Planned sends and actual sends.
- Successful sends.
- Bounce count.
- Complaint count.
- Unsubscribe count.
- Operational status.
- Notes.

Recommended metrics:

- Delivery rate = successful sends / actual sends.
- Bounce rate = bounces / actual sends.
- Complaint rate = complaints / actual sends.
- Plan attainment = actual sends / planned sends.
- Server utilization = actual sends / server daily send limit.
- IP utilization = actual sends / IP target limit.

### Imports Architecture

The import system should become a controlled workflow:

1. Upload CSV/XLSX.
2. Parse headers.
3. User maps columns.
4. Preview validation.
5. Dry run summary.
6. Commit inside a transaction or background job.
7. Store import result.
8. Show row-level errors.

Import modes:

- Create only.
- Update by ID.
- Upsert by provider website.
- Upsert by provider name + country.
- Upsert IP by address.
- Upsert server by provider + server name.

Import validation:

- Required fields.
- Enum mapping.
- Date parsing.
- Number parsing.
- Relationship existence.
- Duplicate detection.
- Permission check.

### Exports Architecture

Export should be authenticated, authorized, filtered, and audited.

Export types:

- Raw entity export.
- Filtered provider export.
- Dashboard snapshot.
- Provider pipeline report.
- Sending performance report.
- Server/IP utilization report.
- Follow-up queue export.

Every export should record:

- User.
- Entity/report type.
- Filters.
- Row count.
- Timestamp.

### Reporting Architecture

Dashboard endpoints should be fast and purpose-built. Reports should be reusable and filterable.

Core report definitions:

- Provider Funnel: not contacted, contacted, awaiting reply, replied, negotiating, accepted, denied, prohibited.
- Outreach Activity: contacts per day/week/month by user/channel.
- Follow-Up SLA: due, overdue, completed, average delay.
- Provider Decision Quality: acceptance rate by country/category/source.
- Server Inventory: active/paused/down/expired servers by provider.
- IP Inventory: active/warming/blocked/retired by provider/server/mailer.
- Sending Performance: volume, delivery, bounces, complaints by date/provider/server/IP/mailer/campaign.
- Cost Efficiency: monthly cost vs successful sends.

### Security Architecture

Minimum production requirements:

- Server-side permission checks on every route.
- Authenticated import/export.
- Strong secrets for NextAuth, cron, Telegram, IMAP, AI provider keys.
- No default cron key in production.
- Rate limits for login, import, export, AI chat, webhooks.
- CSRF-aware mutation strategy.
- Input validation with Zod.
- Audit logs for sensitive actions.
- Environment variable validation at startup.
- Row-level data scoping if multi-tenant.
- Backups and restore procedure for PostgreSQL.

### Reliability And Operations

Required for production:

- Drizzle migrations committed to source control.
- CI checks: typecheck, lint, build, tests.
- Seed data separated from demo/admin credentials.
- Docker build verified with production environment variables.
- Health endpoint.
- Database backup schedule.
- Background job plan for IMAP sync, server inactivity alerts, and import processing.
- Error monitoring and structured logs.

### Testing Strategy

High-priority tests:

- Provider workflow derivation.
- Ready-to-contact rule.
- Providers requiring action query.
- Permission enforcement.
- Import validation and dry run.
- Export authorization.
- Dashboard stats formulas.
- Sending metric calculations.
- Server inactivity alert logic.

Recommended tooling:

- Unit tests for domain functions.
- Integration tests for API routes with test database.
- Playwright smoke tests for core user flows.
- Regression tests for CSV import mappings.

## Prioritized Implementation Roadmap

### Phase 1: Stabilize Core SaaS Safety

Goal: stop risky data access and establish production foundations.

Tasks:

- Add `requireSession()` and `requirePermission()` helpers.
- Protect import and export routes.
- Enforce permissions on providers, servers, IPs, outreach, responses, sending, tasks, users, settings, reports, audit.
- Add Zod schemas for create/update/import endpoints.
- Generate and commit Drizzle migrations.
- Remove default production secrets.
- Add basic CI commands.

### Phase 2: Correct Domain Workflow

Goal: make the app a reliable Google Sheets replacement.

Tasks:

- Create `deriveProviderWorkflow()`.
- Centralize provider status labels and colors.
- Build real action queue endpoint.
- Fix ready-to-contact logic everywhere.
- Add provider workflow tests.
- Add status transition audit/events.
- Clarify accepted/owned/prohibited semantics.

### Phase 3: Rebuild Import/Export As Operational Workflows

Goal: safely migrate and maintain spreadsheet data.

Tasks:

- Store import jobs.
- Add mapping preview.
- Add dry-run validation.
- Add row-level error reporting.
- Add relationship resolution by provider/server/IP names.
- Add audited filtered exports.
- Add export report types.

### Phase 4: Reporting Layer

Goal: make statistics trustworthy and reusable.

Tasks:

- Move dashboard metrics into report services.
- Add date range filters.
- Add user/provider/country/category filters.
- Add sending performance reports.
- Add server/IP utilization reports.
- Add conversion and SLA metrics.

### Phase 5: Production SaaS Hardening

Goal: operate reliably over time.

Tasks:

- Add organization/workspace model if needed.
- Add background job runner.
- Add monitoring/logging.
- Add backup/restore process.
- Add rate limits.
- Add automated tests for critical API routes.
- Add onboarding/setup flow.

## Recommended MVP Scope

For a useful first production version, do not build every possible SaaS feature. Build the smallest reliable replacement for the spreadsheet:

- Login and role-based access.
- Provider directory with correct workflow state.
- Provider details with outreach, responses, servers, IPs, notes, and tasks.
- Server and IP inventory.
- Daily sending logs.
- Dashboard with real action queue.
- Imports with validation preview.
- Exports with authorization.
- Reports for provider funnel and sending performance.
- Audit log.

Defer:

- Billing/subscriptions.
- Multi-tenant customer self-service unless required.
- Heavy AI automation.
- Complex notification preference center.
- Advanced materialized analytics.

## Acceptance Criteria For The Correct SaaS Structure

The project should be considered architecturally ready when:

- Every API route authenticates and authorizes correctly.
- Import/export cannot be used anonymously or without permission.
- All database schema changes are reproducible from migrations.
- Provider workflow derivation is centralized and tested.
- Providers requiring action uses true business criteria.
- Dashboard/report metrics have explicit formulas and tests.
- User roles match real operational responsibilities.
- CSV/XLSX import can validate before writing data.
- Audit logs capture all sensitive mutations.
- Production secrets are required and no default secrets are accepted.
- The app can be deployed from a clean checkout with documented steps.

## Final Recommendation

Do not restart from scratch. The current project already contains many of the right entities and screens. The best path is to keep the app and harden it into a real SaaS in this order:

1. Security and permissions.
2. Database migrations and validation.
3. Canonical provider workflow.
4. Real action queue.
5. Safe imports/exports.
6. Reporting services.
7. Production operations.

The dashboard visual correction prompt should remain useful, but it should be treated as a frontend refinement task after the architecture above is in place. A beautiful dashboard is valuable only if the underlying workflow state and metrics are trustworthy.
