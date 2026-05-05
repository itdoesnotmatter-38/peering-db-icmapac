# Monthly Snapshots (Global)

## Overview
This system captures a global PeeringDB snapshot on the last day of each month in Singapore time.

Storage split:
- Raw records in Vercel Blob (`net`, `org`)
- Aggregates in Postgres for trend charts

## Scheduler
Primary scheduler is GitHub Actions:
- Workflow: `.github/workflows/monthly-global-snapshot.yml`
- Trigger: `27-31` each month at `16:10 UTC` (which is `00:10` Singapore)
- The runner skips unless it is the last Singapore calendar day of the month.

## Required GitHub repository secrets
Configure these in GitHub repository settings:
- `PEERINGDB_API_KEY`
- `POSTGRES_URL`
- `BLOB_READ_WRITE_TOKEN`

## Captured data
Raw files written to Blob prefix `${SNAPSHOT_BLOB_PREFIX}/${snapshot_date}`:
- `net.jsonl.gz`
- `org.jsonl.gz`
- `networks.csv`
- `manifest.json`

Aggregates written to Postgres:
- `pdb_snapshot_runs`
- `pdb_snapshot_network_types`
- `pdb_snapshot_origin_countries`

## Optional environment variables
Defaults are used if not provided:
- `SNAPSHOT_TIMEZONE=Asia/Singapore`
- `SNAPSHOT_BLOB_PREFIX=snapshots`
- `SNAPSHOT_BLOB_ACCESS=public`
- `SNAPSHOT_PAGE_LIMIT=5000`
- `SNAPSHOT_MAX_PAGES=5000`
- `SNAPSHOT_PAGE_DELAY_MS=150`
- `PEERINGDB_MAX_RETRIES=50`
- `PEERINGDB_MAX_RETRY_TIME_MS=1200000`

## Manual execution
From CLI:

```bash
npm run snapshot:run
npm run snapshot:run -- --force
npm run snapshot:run -- --force --snapshot-date=2026-04-30
```

From GitHub Actions UI:
- Open workflow `Monthly Global PeeringDB Snapshot`
- Click `Run workflow`
- Set `force=true` to bypass last-day check

## Vercel endpoint (optional)
`/api/snapshots/run` still exists for ad hoc runs, but GitHub Actions is the main path for global snapshot duration.

Portal download API/UI:
- `GET /api/snapshots/latest` returns recent completed snapshot metadata with direct Blob URLs.
- Dashboard sidebar shows latest downloadable files (`net.jsonl.gz`, `org.jsonl.gz`, `networks.csv`, `manifest.json`).
- `GET /api/snapshots/csv?snapshotDate=YYYY-MM-DD` generates a `networks.csv` on demand from stored snapshot sources, so older runs remain spreadsheet-downloadable even if they predate `networks.csv` uploads.
- `GET /api/snapshots/origin-countries-csv?snapshotDate=YYYY-MM-DD` downloads network origin country counts as `snapshot_date`, `origin_country`, and `network_count`. It uses stored snapshot aggregates when present and falls back to the raw `net`/`org` snapshot files.
- `/downloads` provides a dedicated UI for snapshot downloads plus snapshot-based country and region exports for `combined`, `IX view`, and `facility view` CSVs.
- `GET /api/snapshots/country-csv?snapshotDate=YYYY-MM-DD&country=SG&view=ix` generates snapshot-based country CSV exports. `IX view` is a network-level summary with deployed capacity across all IXs in the selected market. Use `view=facility` for a network-level summary of presence across all facilities in the selected market.
- `GET /api/snapshots/country-csv?snapshotDate=YYYY-MM-DD&region=APAC&view=ix` generates snapshot-based region CSV exports using the current portal metro coverage countries for `APAC`, `EMEA`, and `AMER`.
- Use `view=combined` to download a single market CSV that includes both IX rows and facility rows, with no roll-up between them. The file uses a `record_type` column so each IX and each facility relationship stays separate.

## Snapshot scope for country and region IX/facility exports
To support true snapshot-based `IX view` and `facility view` exports, snapshots now also store:
- `ix.jsonl.gz`
- `fac.jsonl.gz`
- `netixlan.jsonl.gz`
- `netfac.jsonl.gz`

Older snapshots created before these files were added cannot produce historical country `IX` / `facility` exports. Re-run a snapshot with the current pipeline if you need those views for a given date.

## Sample export for field validation
```bash
export PEERINGDB_API_KEY="..."
npm run snapshot:sample -- /tmp/pdb_snapshot_global_sample.json 50
```
Fields include `asn`, `network_name`, `network_type`, `org_name`, `org_country`, `org_city`.
