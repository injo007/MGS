# ServerOps CRM Current App Audit

Date: 2026-07-20

## Implemented in this pass

- Fixed the floating CloudOps AI chat so it can always be closed after a conversation starts.
- Closing the chat now aborts an in-flight AI response instead of leaving the panel in a locked loading state.
- Added a real 7-day Sending Statistics panel to the Sending Control Center.
- Weekly sending statistics are calculated from application data, using server daily history plus sending logs.
- Weekly metrics now show sent volume, delivered rate, bounce rate, complaint rate, and day-level issue counts.

## Highest priority missing work

1. Server-side authorization is incomplete.

   The app has `src/lib/permissions.ts`, role tables, and permission seed data, but API routes do not enforce permissions. Most routes only check whether a user is authenticated. A real SaaS needs route-level permission checks for every view, create, update, delete, import, export, and settings action.

2. Import and export endpoints are not protected enough.

   `src/app/api/import/route.ts` and `src/app/api/export/route.ts` do not call `auth()`. These endpoints can write or export core operational data and should require authentication, permission checks, validation, rate limits, and audit logging.

3. Tenant or organization scoping is missing.

   The schema has users and roles, but no organization or tenant boundary. If this SaaS will ever support more than one customer/team, core records need `organization_id` and all queries must be scoped.

4. Database migrations are missing.

   `drizzle.config.ts` and database scripts exist, but no committed migration folder was found. The project needs repeatable migrations for production deployment instead of relying on push/seed behavior.

5. Sending rules need a persistent model.

   Daily send limit exists on servers, and daily sent values are stored through sending logs. However, hourly cap, auto throttle, auto pause, thresholds, sending window, timezone, routing rules, and warmup settings are still UI-level values. These should be stored in a dedicated sending rules/settings table.

6. Reports need formal definitions.

   Reports and pipeline views are improved visually, but SaaS reporting needs agreed formulas for provider pipeline, contact conversion, server cost, sending performance, bounce/complaint thresholds, team productivity, and audit/compliance exports.

7. Full lint is not clean.

   Focused touched-file lint can pass, but the project still contains broader pre-existing lint issues such as loose `any` usage and React hook/state warnings. These should be fixed before treating the app as production-ready.

## Recommended build order

1. Add `requirePermission(permission)` and enforce it in every API route.
2. Secure import/export first because they have the biggest data-risk surface.
3. Add migrations and a deployment-ready database workflow.
4. Add a persistent sending rules model and connect the Sending drawer fields to it.
5. Add organization scoping if the product is meant to be a multi-tenant SaaS.
6. Finish report definitions and build reports from server-side aggregate endpoints.
7. Clean full lint and add regression tests for dashboard, servers, sending, import/export, and permissions.

## Navigation status

- The sidebar keeps the approved navigation names: Dashboard, Providers, Servers, Sending, Pipeline, Provider Responses, Follow-ups, Email Inbox, Contacts, Tasks, Team, Reports, Audit Log, Import / Export, Settings.
- The old IP Addresses page is not in the sidebar and redirects to Servers.
- IP address API support still exists because server and provider workflows still need IP-level data.

