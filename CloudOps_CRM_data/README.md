# CloudOps CRM — OpenCode / Big Pickle Bundle

Place this bundle in the root of the project that Big Pickle/OpenCode will build.

## Files
- `AGENTS.md` — project instructions automatically usable as OpenCode repository context.
- `data/providers.json` — provider seed/import data.
- `data/outreach.json` — confirmed outreach records.
- Other JSON files are empty templates for future data.

## Recommended OpenCode flow
1. Copy these files into the project root.
2. Start OpenCode in that directory.
3. Ask the agent to read `AGENTS.md`.
4. In Plan mode, ask it to propose the implementation phases.
5. Then implement phase-by-phase.
6. Import the JSON seed data through a database seed script or through the app importer once built.

Do not treat unknown fields as false. Missing values should remain `null` or blank.
