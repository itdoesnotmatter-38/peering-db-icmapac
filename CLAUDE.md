# PeeringDB Portal: Claude Code Instructions

Read `docs/claude_handoff.md` before making substantive changes. For snapshot work,
also read `docs/monthly_snapshot_checklist.md` and `docs/snapshots.md`.

## Project

- GitHub: `itdoesnotmatter-38/peering-db-icmapac`
- Production: `https://peeringdb-dashboard.vercel.app`
- Vercel project: `peeringdb-dashboard`
- Default branch: `main`
- Stack: Create React App, React/TypeScript, Vercel Functions, Neon Postgres,
  Vercel Blob, and GitHub Actions

The portal has four main user flows:

- `/`: live PeeringDB metro exploration, matrix, comparison, insight builder,
  and PDF/CSV exports
- `/downloads`: stored snapshot and country/region CSV downloads
- `/trends`: APAC historical analysis built only from stored snapshots
- `/asn/:asn`, `/ix/:ix_id`, `/fac/:fac_id`: entity detail views

## Non-negotiable Working Rules

1. Never commit secret values. Refer only to environment variable names.
2. Do not deploy or push to `main` unless the user explicitly asks.
3. Work in an isolated branch/worktree for code changes. Preserve unrelated and
   pre-existing changes, including the repository's `.worktrees/` directory.
4. Before changing snapshot behavior, understand both GitHub workflows and the
   retry semantics in `api/_lib/snapshotRunner.js`.
5. Prefer GitHub Actions for global snapshots. A full run may exceed Vercel's
   function duration even though `/api/snapshots/run` exists.
6. PeeringDB throttling is normal. Respect `Retry-After`/body wait guidance and
   do not replace conservative retry settings with request bursts.
7. A historical snapshot is complete for trends only when its manifest contains
   `net`, `org`, `ix`, `fac`, `netixlan`, and `netfac` files.
8. Live browser data and stored snapshots are different products. Do not silently
   substitute one for the other.
9. After frontend or API changes, run `npm run build`. For end-to-end local API
   verification, use `npx vercel dev`, not only `npm start`.

## Key Files

- `src/PeeringDBDashboard.tsx`: live metro loader, caches, matrix, comparisons,
  insight builder, and report exports
- `src/DownloadsPage.tsx`: snapshot download UI
- `src/TrendsPage.tsx`: APAC trends UI
- `src/peeringdbApi.ts`: browser-side proxy client
- `api/peeringdb.js`: authenticated browser proxy with pagination and retries
- `api/_lib/peeringdb.js`: long-running snapshot fetcher and backoff logic
- `api/_lib/snapshotRunner.js`: global six-dataset snapshot pipeline
- `api/_lib/snapshotDb.js`: Neon metadata and aggregate tables
- `api/snapshots/trends.js`: builds APAC historical datasets from Blob files
- `.github/workflows/monthly-global-snapshot.yml`: primary month-end schedule
- `.github/workflows/monthly-snapshot-backstop.yml`: previous-month retry on day 2

## Standard Commands

```bash
npm install
npm run build
npx vercel dev
npm run metro:check -- http://localhost:3000
npm run snapshot:run -- --snapshot-date=YYYY-MM-DD
```

Do not run a snapshot locally unless the required secrets are intentionally
available in the environment and the user has asked for the run.

## First Checks in a New Session

```bash
git status --short
git log -8 --oneline
npm run build
curl -s 'https://peeringdb-dashboard.vercel.app/api/snapshots/latest?limit=3'
```

Then inspect recent GitHub Actions runs for both monthly snapshot workflows.
