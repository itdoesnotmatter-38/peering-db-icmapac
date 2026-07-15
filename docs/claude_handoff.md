# Claude Handoff: PeeringDB Portal

Last reviewed: 2026-07-15 (Asia/Singapore)

## 1. Purpose and Current State

This project is a PeeringDB analysis portal for exploring network presence,
deployed IX capacity, and facility/DC presence by metro. It combines live
PeeringDB data with monthly global snapshots for historical analysis.

- Production: `https://peeringdb-dashboard.vercel.app`
- GitHub: `git@github.com:itdoesnotmatter-38/peering-db-icmapac`
- Vercel project: `peeringdb-dashboard`
- Branch deployed to production: `main`
- Snapshot Blob store and Neon database display name: `peeringdb-snapshots`

Production health checked on 2026-07-15:

- Latest completed snapshot: `2026-06-30`
- Networks: `34,783`
- Organizations: `34,098`
- Blob prefix: `snapshots/2026-06-30`

The next normal snapshot label should be `2026-07-31`. The primary workflow
checks several times during July 27-31; the backstop retries July 31 on August 2
if needed.

## 2. Product Areas

### Live dashboard (`/`)

`src/PeeringDBDashboard.tsx` is the largest and most sensitive frontend file.
It contains:

- APAC, EMEA, and AMER metro selection
- live PeeringDB loading through `/api/peeringdb`
- per-session in-memory metro caches
- ASN x IX/facility matrices
- metro presence comparison and network deep dives
- insight/chart builder
- CSV and printable PDF report generation

Live data remains available while navigating within the single-page app, but a
browser refresh normally clears the React in-memory cache. Do not describe live
session caching as permanent storage.

### Snapshot downloads (`/downloads`)

`src/DownloadsPage.tsx` exposes:

- raw snapshot files and manifest
- network CSV
- origin-country and origin-network CSVs
- country or region exports for IX, facility, and combined views

Region exports retain separate city/country/IX/facility rows. They should not
silently roll all APAC entities into one aggregate row.

### APAC trends (`/trends`)

`src/TrendsPage.tsx` uses `/api/snapshots/trends`. The API downloads stored Blob
files and builds:

- metro trends
- IX rankings and capacity trends
- facility presence rankings
- network trends
- per-network, per-IX capacity trends
- market changes between snapshots

This page does not fetch live PeeringDB data. Snapshots missing any required
historical source file are intentionally reported as skipped.

### Detail routes

- `/asn/:asn`
- `/ix/:ix_id`
- `/fac/:fac_id`

These are routed through `src/DetailView.tsx`.

## 3. Architecture and Data Flow

### Live flow

1. Browser requests `/api/peeringdb` through `src/peeringdbApi.ts`.
2. `api/peeringdb.js` adds `PEERINGDB_API_KEY` server-side.
3. `all=1` requests paginate with `limit`/`skip` and return debugging headers:
   `x-peeringdb-rows`, `x-peeringdb-pages`, and `x-peeringdb-page-size`.
4. The dashboard joins networks by PeeringDB `net_id`, including networks that
   appear only in `netfac` and not in `netixlan`.

The browser must not call `www.peeringdb.com` directly in production.

### Snapshot flow

1. GitHub Actions runs `scripts/run_snapshot_job.js`.
2. `api/_lib/snapshotRunner.js` fetches all pages from PeeringDB with the API key.
3. Gzipped JSON Lines files and `networks.csv` are uploaded to Vercel Blob.
4. `manifest.json` records file URLs and row counts.
5. `api/_lib/snapshotDb.js` records run status/URLs and small aggregates in Neon.
6. Download and trends APIs read metadata from Neon and source data from Blob.

Each current snapshot stores under `snapshots/YYYY-MM-DD/`:

- `net.jsonl.gz`
- `org.jsonl.gz`
- `ix.jsonl.gz`
- `fac.jsonl.gz`
- `netixlan.jsonl.gz`
- `netfac.jsonl.gz`
- `networks.csv`
- `manifest.json`

The database tables are:

- `pdb_snapshot_runs`
- `pdb_snapshot_network_types`
- `pdb_snapshot_origin_countries`

## 4. Environment Variables and Secrets

Never write values into this repository, issue comments, logs, or handoff docs.

Required for global snapshots:

- `PEERINGDB_API_KEY`
- `POSTGRES_URL` (the code also accepts `POSTGRES_PRISMA_URL`, `DATABASE_URL`,
  or `DATABASE_URL_UNPOOLED`)
- `BLOB_READ_WRITE_TOKEN`

Optional/runtime variables:

- `CRON_SECRET`
- `SNAPSHOT_TIMEZONE`
- `SNAPSHOT_BLOB_PREFIX`
- `SNAPSHOT_BLOB_ACCESS`
- `SNAPSHOT_PAGE_LIMIT`
- `SNAPSHOT_MAX_PAGES`
- `SNAPSHOT_PAGE_DELAY_MS`
- `SNAPSHOT_DATE_OVERRIDE`
- `PEERINGDB_API_BASE_URL`
- `PEERINGDB_MAX_RETRIES`
- `PEERINGDB_MAX_DELAY_MS`
- `PEERINGDB_MAX_RETRY_TIME_MS`
- `REACT_APP_API_ROOT`
- `REACT_APP_PROXY_TARGET`

GitHub Actions needs the three required snapshot secrets as repository secrets.
Vercel needs the relevant server-side variables for Production (and Preview or
Development only when those environments need the same APIs). After changing a
Vercel environment variable, redeploy so the deployment receives it.

## 5. Snapshot Scheduling and Reliability

Primary workflow: `.github/workflows/monthly-global-snapshot.yml`

- Runs at `00:10`, `06:10`, `12:10`, and `18:10` UTC on dates 27-31.
- The runner executes only when it is the last calendar day in
  `Asia/Singapore`, unless a date override or force flag is supplied.
- A completed snapshot skips later attempts.
- A `running` row skips a non-forced attempt.
- An `error` row is retryable; this behavior must not regress.

Backstop workflow: `.github/workflows/monthly-snapshot-backstop.yml`

- Runs at `02:10 UTC` on the second day of each month.
- Resolves the previous Singapore month-end date.
- Re-runs that label if it is absent or failed; completed runs skip safely.

Why both exist: PeeringDB can throttle long global exports. In June 2026, the
month-end run failed and was not recovered until manual intervention. The retry
semantics, expanded primary schedule, and backstop were added to prevent that
failure mode.

Current workflows deliberately use conservative values:

- page delay: 3 seconds
- maximum retries: 3,000
- maximum individual delay: 120 seconds
- total retry time: 5 hours
- job timeout: 6 hours

Do not reduce these merely to make the workflow look faster.

## 6. Manual Snapshot and Recovery

Preferred method: GitHub Actions UI.

1. Open `Actions` in `itdoesnotmatter-38/peering-db-icmapac`.
2. Select `Monthly Global PeeringDB Snapshot`.
3. Click `Run workflow`.
4. Set `snapshot_date` to the intended month-end label, for example
   `2026-07-31`.
5. Leave `force=false` to retry a missing/error run. Use `force=true` only to
   replace an already completed snapshot.
6. Watch the complete job. Do not assume a green workflow from another date
   means the intended label exists.

CLI equivalent when secrets are intentionally available:

```bash
npm run snapshot:run -- --snapshot-date=YYYY-MM-DD
npm run snapshot:run -- --force --snapshot-date=YYYY-MM-DD
```

`/api/snapshots/run` is an optional authenticated Vercel endpoint. It is not the
preferred path for a full global run because the function is configured for a
300-second maximum duration.

After any run, verify all three layers:

1. GitHub job completed successfully.
2. `/api/snapshots/latest?limit=3` lists the intended date as `complete`.
3. Its manifest contains URLs and non-zero counts for all six raw datasets.

## 7. Local Development and Verification

Install and build:

```bash
npm install
npm run build
```

Run the full local Vercel environment from the repository root:

```bash
npx vercel dev
```

Vercel may choose another port when the preferred port is occupied. Use the URL
shown after `Ready!`. `npm start` runs the CRA frontend but does not reproduce
the production Vercel Functions setup.

Useful checks:

```bash
npm run metro:check -- http://localhost:PORT
curl -s 'http://localhost:PORT/api/snapshots/latest?limit=3'
curl -s 'https://peeringdb-dashboard.vercel.app/api/snapshots/latest?limit=3'
```

For live-data correctness, inspect the browser Network panel and verify:

- calls use `/api/peeringdb`
- no browser request goes directly to `www.peeringdb.com`
- full retrieval calls have `all=1`
- pagination headers report plausible rows/pages
- facility-only networks are present in the final network set

## 8. Deployment

Production is normally created automatically from pushes to `main` through the
GitHub/Vercel integration.

Before deployment:

1. Review `git status` and preserve unrelated user changes.
2. Run `npm run build`.
3. Test the changed flow with `npx vercel dev` when APIs are involved.
4. Commit only the intended files.
5. Push only after explicit user approval.

After deployment:

1. Confirm Vercel shows the new `main` commit as Current/Ready.
2. Open the affected production route.
3. Verify its API calls and one representative user flow.
4. For snapshot changes, verify the metadata endpoint but do not start an
   unnecessary full snapshot.

## 9. Known Risks and Follow-up Areas

### PeeringDB throttling

Large metros and global datasets can receive HTTP 429 responses or a JSON body
asking the client to wait. Both `api/peeringdb.js` and
`api/_lib/peeringdb.js` contain retry handling. Preserve useful progress and
error messages without exposing raw secrets or overwhelming users with repeated
retry text.

### Facility classification and aliases

PeeringDB facility `city` values do not always match the expected metro name.
`api/snapshots/trends.js` has explicit APAC aliases and country-wide handling
for Singapore and Hong Kong. `src/PeeringDBDashboard.tsx` maintains a related
live metro configuration. Keep these definitions aligned when adding or fixing
a metro.

Hong Kong/Equinix was a specific issue: facilities such as HK1/HK2 may use
district city values or current PeeringDB names instead of the familiar market
label. Recent commits added country-wide Hong Kong handling, but future agents
should validate the raw `fac` and `netfac` snapshot files before concluding a
facility is absent. A ranking can also hide a facility because of top-N display
or selected filters even when the raw snapshot contains it.

### Incomplete old snapshots

The `2026-02-28` snapshot predates the full six-file historical pipeline. Its
metadata is complete for the older network download use case, but trends skip
it because the manifest lacks `ix`, `fac`, `netixlan`, and `netfac`. Do not
fabricate those historical files from current live data.

### Documentation debt

The top-level `README.md` is still the default Create React App document. Treat
this handoff and `CLAUDE.md` as the operational source of truth until README is
rewritten.

### Repository state

At handoff time, `.worktrees/` is untracked and pre-existing. Do not remove,
stage, or modify it unless the user explicitly requests that worktree cleanup.

## 10. Recent Reliability History

Relevant commits before this handoff include:

- `6585003` Make snapshot exports pivot friendly
- `d624b7c` Remove June backfill workflow
- `b7cbb3c` Harden snapshot throttling and logs
- `0406b90` Add monthly snapshot backstop
- `871217e` Harden monthly snapshot retries
- `7082a5f` Add metro facility aliases for APAC
- `38d9f69` Include all Hong Kong facilities in trends

Use Git history for implementation detail, but verify current code because the
portal has evolved significantly since the original Singapore pagination fix.

## 11. Suggested First Claude Code Prompt

```text
Read CLAUDE.md, docs/claude_handoff.md, docs/monthly_snapshot_checklist.md,
and docs/snapshots.md completely. Then inspect git status, the two snapshot
workflows, and the production latest-snapshot endpoint. Do not change or deploy
anything yet. Report current health, risks, and the next expected snapshot date.
```
