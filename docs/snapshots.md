# Monthly Snapshots (Global)

## Overview
This job captures a global PeeringDB snapshot on the **last day of each month** (Singapore time).

Data is stored in two places:
- **Raw data** (full JSON) in Vercel Blob
- **Aggregates** in Postgres for trend charts

## What is captured
- `net` (all networks worldwide)
- `org` (all organizations worldwide)

Aggregates stored in Postgres:
- Total network count
- Counts by `info_type` (content/ISP/etc)
- Counts by origin country (from org.country)

## Cron schedule
The cron runs daily at **00:05 Singapore time** and only executes on the last day of the month.

## Required env vars
- `PEERINGDB_API_KEY`
- `POSTGRES_URL`
- `BLOB_READ_WRITE_TOKEN`
- `SNAPSHOT_TIMEZONE` (optional, defaults to `Asia/Singapore`)
- `SNAPSHOT_BLOB_PREFIX` (optional, defaults to `snapshots`)
- `SNAPSHOT_MAX_PAGES` (optional safety limit)
- `SNAPSHOT_PAGE_DELAY_MS` (optional, throttling control)

## Run manually
To trigger once (bypass last-day check):

```
https://<your-domain>/api/snapshots/run?force=1
```

Optional: set `CRON_SECRET` and call with `Authorization: Bearer <secret>` or `?secret=<secret>`.

## Sample export (local)
Generate a small global sample (ASN/name/origin/type fields):

```
export PEERINGDB_API_KEY="..."
npm run snapshot:sample -- /tmp/pdb_snapshot_global_sample.json 50
```
