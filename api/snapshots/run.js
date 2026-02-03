const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");
const { put } = require("@vercel/blob");

const { fetchAllPages } = require("../_lib/peeringdb");
const {
  ensureSchema,
  getRun,
  upsertRun,
  clearAggregates,
  insertTypeCounts,
  insertCountryCounts,
} = require("../_lib/snapshotDb");

const TIMEZONE = process.env.SNAPSHOT_TIMEZONE || "Asia/Singapore";
const BLOB_PREFIX = process.env.SNAPSHOT_BLOB_PREFIX || "snapshots";
const MAX_PAGES = Number.parseInt(process.env.SNAPSHOT_MAX_PAGES || "5000", 10);
const PAGE_DELAY_MS = Number.parseInt(process.env.SNAPSHOT_PAGE_DELAY_MS || "150", 10);

const formatDateInTz = (date, timeZone) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const isLastDayOfMonth = (date, timeZone) => {
  const today = formatDateInTz(date, timeZone);
  const tomorrow = formatDateInTz(new Date(date.getTime() + 24 * 60 * 60 * 1000), timeZone);
  return today.slice(0, 7) !== tomorrow.slice(0, 7);
};

const ensureAuth = (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers?.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.query?.secret;
  return token === secret;
};

const createGzipWriter = async (filePath) => {
  const gzip = zlib.createGzip();
  const fileStream = fs.createWriteStream(filePath);
  const done = pipeline(gzip, fileStream);
  return { gzip, done };
};

const uploadFile = async (blobPath, filePath, contentType) => {
  const stream = fs.createReadStream(filePath);
  const result = await put(blobPath, stream, {
    access: "private",
    addRandomSuffix: false,
    contentType,
  });
  return result.url;
};

module.exports = async (req, res) => {
  if (!ensureAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const apiKey = process.env.PEERINGDB_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing PEERINGDB_API_KEY" });
    return;
  }

  if (!process.env.POSTGRES_URL) {
    res.status(500).json({ error: "Missing POSTGRES_URL" });
    return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.status(500).json({ error: "Missing BLOB_READ_WRITE_TOKEN" });
    return;
  }

  const now = new Date();
  const snapshotDate = formatDateInTz(now, TIMEZONE);
  const force = req.query?.force === "1" || req.query?.force === "true";

  if (!force && !isLastDayOfMonth(now, TIMEZONE)) {
    res.status(200).json({ skipped: true, reason: "Not last day of month", snapshotDate });
    return;
  }

  try {
    await ensureSchema();
    const existing = await getRun(snapshotDate);
    if (existing && !force) {
      res.status(200).json({ skipped: true, reason: "Snapshot already exists", snapshotDate });
      return;
    }

    await upsertRun({
      snapshotDate,
      status: "running",
      startedAt: now.toISOString(),
      completedAt: null,
      netCount: null,
      orgCount: null,
      blobPrefix: null,
    });
    await clearAggregates(snapshotDate);

    const tmpDir = "/tmp";
    const netPath = path.join(tmpDir, `pdb-net-${snapshotDate}.jsonl.gz`);
    const orgPath = path.join(tmpDir, `pdb-org-${snapshotDate}.jsonl.gz`);

    const { gzip: netGzip, done: netDone } = await createGzipWriter(netPath);
    const { gzip: orgGzip, done: orgDone } = await createGzipWriter(orgPath);

    const typeCounts = new Map();
    const orgIdCounts = new Map();
    let netCount = 0;

    await fetchAllPages({
      obj: "net",
      params: {},
      apiKey,
      maxPages: MAX_PAGES,
      pageDelayMs: PAGE_DELAY_MS,
      onPage: async (rows) => {
        rows.forEach((row) => {
          netGzip.write(`${JSON.stringify(row)}\n`);
          netCount += 1;
          const infoType = row.info_type || "unknown";
          typeCounts.set(infoType, (typeCounts.get(infoType) || 0) + 1);
          if (row.org_id) {
            orgIdCounts.set(row.org_id, (orgIdCounts.get(row.org_id) || 0) + 1);
          }
        });
      },
    });

    netGzip.end();
    await netDone;

    const countryCounts = new Map();
    let orgCount = 0;

    await fetchAllPages({
      obj: "org",
      params: {},
      apiKey,
      maxPages: MAX_PAGES,
      pageDelayMs: PAGE_DELAY_MS,
      onPage: async (rows) => {
        rows.forEach((row) => {
          orgGzip.write(`${JSON.stringify(row)}\n`);
          orgCount += 1;
          const count = orgIdCounts.get(row.id);
          if (count) {
            const country = row.country || "unknown";
            countryCounts.set(country, (countryCounts.get(country) || 0) + count);
          }
        });
      },
    });

    orgGzip.end();
    await orgDone;

    const blobPrefix = `${BLOB_PREFIX}/${snapshotDate}`;
    const netUrl = await uploadFile(`${blobPrefix}/net.jsonl.gz`, netPath, "application/gzip");
    const orgUrl = await uploadFile(`${blobPrefix}/org.jsonl.gz`, orgPath, "application/gzip");

    const manifest = {
      snapshot_date: snapshotDate,
      generated_at: now.toISOString(),
      timezone: TIMEZONE,
      net_count: netCount,
      org_count: orgCount,
      files: {
        net: netUrl,
        org: orgUrl,
      },
    };

    await put(`${blobPrefix}/manifest.json`, JSON.stringify(manifest, null, 2), {
      access: "private",
      addRandomSuffix: false,
      contentType: "application/json",
    });

    await insertTypeCounts(snapshotDate, typeCounts);
    await insertCountryCounts(snapshotDate, countryCounts);

    await upsertRun({
      snapshotDate,
      status: "complete",
      startedAt: now.toISOString(),
      completedAt: new Date().toISOString(),
      netCount,
      orgCount,
      blobPrefix,
    });

    res.status(200).json({
      ok: true,
      snapshotDate,
      netCount,
      orgCount,
      blobPrefix,
    });
  } catch (err) {
    console.error("Snapshot run failed", err);
    try {
      await upsertRun({
        snapshotDate,
        status: "error",
        startedAt: now.toISOString(),
        completedAt: new Date().toISOString(),
        netCount: null,
        orgCount: null,
        blobPrefix: null,
      });
    } catch (dbErr) {
      console.error("Failed to update snapshot run", dbErr);
    }
    res.status(500).json({ error: err?.message || "Snapshot run failed" });
  }
};
