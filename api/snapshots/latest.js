const { ensureSchema, listRecentCompleteRuns } = require("../_lib/snapshotDb");

const toIsoDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const toDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
};

module.exports = async (req, res) => {
  const limit = Number.parseInt(String(req.query?.limit || "6"), 10);

  try {
    await ensureSchema();
    const runs = await listRecentCompleteRuns(limit);
    const mapped = runs.map((row) => ({
      snapshotDate: toDateOnly(row.snapshot_date),
      status: row.status,
      startedAt: toIsoDate(row.started_at),
      completedAt: toIsoDate(row.completed_at),
      netCount: row.net_count,
      orgCount: row.org_count,
      blobPrefix: row.blob_prefix,
      netUrl: row.net_url,
      orgUrl: row.org_url,
      manifestUrl: row.manifest_url,
    }));

    res.status(200).json({
      latest: mapped[0] || null,
      runs: mapped,
    });
  } catch (err) {
    console.error("Failed to load snapshot metadata", err);
    res.status(500).json({ error: err?.message || "Failed to load snapshot metadata" });
  }
};
