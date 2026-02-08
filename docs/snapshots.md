# Monthly Snapshots (Global)

## Overview
This system captures a global PeeringDB snapshot on the last day of each month in Singapore time.

Storage split:
- Raw records in Vercel Blob (`net`, `org`)
- Aggregates in Postgres for trend charts

## Scheduler
Primary scheduler is GitHub Actions:
- Workflow: `.github/workflows/monthly-global-snapshot.yml`
- Trigger: daily at `16:10 UTC` (which is `00:10` Singapore)
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
- `manifest.json`

Aggregates written to Postgres:
- `pdb_snapshot_runs`
- `pdb_snapshot_network_types`
- `pdb_snapshot_origin_countries`

## Optional environment variables
Defaults are used if not provided:
- `SNAPSHOT_TIMEZONE=Asia/Singapore`
- `SNAPSHOT_BLOB_PREFIX=snapshots`
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
```

From GitHub Actions UI:
- Open workflow `Monthly Global PeeringDB Snapshot`
- Click `Run workflow`
- Set `force=true` to bypass last-day check

## Vercel endpoint (optional)
`/api/snapshots/run` still exists for ad hoc runs, but GitHub Actions is the main path for global snapshot duration.

## Sample export for field validation
```bash
export PEERINGDB_API_KEY="..."
npm run snapshot:sample -- /tmp/pdb_snapshot_global_sample.json 50
```
Fields include `asn`, `network_name`, `network_type`, `org_name`, `org_country`, `org_city`.
