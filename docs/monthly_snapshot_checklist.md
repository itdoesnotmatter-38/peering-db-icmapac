# Monthly PeeringDB Snapshot Checklist

Use this checklist every month. Times and dates are interpreted in
`Asia/Singapore` unless explicitly marked UTC.

## Before Month End (27th-28th)

- [ ] Confirm both GitHub workflows are enabled:
  `Monthly Global PeeringDB Snapshot` and `Monthly Snapshot Backstop`.
- [ ] Confirm the latest `main` workflow files still contain the required
  repository secret names: `PEERINGDB_API_KEY`, `POSTGRES_URL`, and
  `BLOB_READ_WRITE_TOKEN`.
- [ ] Check that no accidental `running` row from a much older attempt is
  blocking the upcoming label.
- [ ] Confirm the production latest-snapshot endpoint responds successfully:

```bash
curl -s 'https://peeringdb-dashboard.vercel.app/api/snapshots/latest?limit=3'
```

## Month-End Window (Last Singapore Calendar Day)

- [ ] Open GitHub Actions and watch `Monthly Global PeeringDB Snapshot`.
- [ ] Expect repeated scheduled checks; only the correct Singapore month-end
  date performs the export, and later checks skip after success.
- [ ] PeeringDB throttling and waits are normal. Do not cancel a progressing job
  just because it pauses between pages.
- [ ] Confirm at least one run for the intended `YYYY-MM-DD` label completes.

## Verification (By the 1st)

- [ ] Check `/api/snapshots/latest?limit=3` and confirm the intended date is the
  newest run with `status: complete`.
- [ ] Confirm `netCount` and `orgCount` are non-zero and broadly plausible
  compared with the previous month.
- [ ] Open the new `manifest.json` and confirm all entries exist:
  `net`, `org`, `ix`, `fac`, `netixlan`, `netfac`, and `networks_csv`.
- [ ] Confirm each manifest count is non-zero.
- [ ] Open `/downloads` and test one normal CSV plus one APAC IX/facility export.
- [ ] Open `/trends` and confirm the new date appears and is not listed as an
  incomplete skipped snapshot.
- [ ] Spot-check at least one APAC metro, one IX, and one facility ranking.

## Automatic Backstop (2nd Day)

- [ ] Confirm `Monthly Snapshot Backstop` ran at `02:10 UTC` on the 2nd.
- [ ] If the primary snapshot already completed, a safe skip is expected.
- [ ] If the primary failed, confirm the backstop retried the previous month-end
  label and completed it.

## Manual Recovery

If the snapshot is still absent or failed:

1. Open GitHub Actions.
2. Select `Monthly Global PeeringDB Snapshot`.
3. Choose `Run workflow`.
4. Enter the missing month-end in `snapshot_date`.
5. Use `force=false` for an absent/error run.
6. Use `force=true` only when intentionally replacing a completed snapshot.
7. Watch the job through completion.
8. Repeat every verification item above.

Do not use `/api/snapshots/run` as the primary recovery mechanism for a full
global snapshot; Vercel's function duration is shorter than the GitHub job's
six-hour allowance.

## Escalate When

- The job remains `running` after its six-hour timeout.
- The same PeeringDB page exhausts the five-hour retry window.
- A run is marked complete but its manifest lacks any required file.
- Counts drop unexpectedly by more than roughly 10% without a known PeeringDB
  data change.
- Blob uploads succeed but Neon metadata does not show the completed date.
- A facility/IX is missing from trends but exists in the raw snapshot files.

When escalating, record the snapshot label, failed object/page, GitHub run URL,
last retry message, and whether Blob or Neon contains partial results. Never
include secret values.
