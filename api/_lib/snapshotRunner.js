const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");
const { put } = require("@vercel/blob");

const { fetchAllPages } = require("./peeringdb");
const {
  ensureSchema,
  getRun,
  upsertRun,
  upsertRunWithUrls,
  clearAggregates,
  insertTypeCounts,
  insertCountryCounts,
} = require("./snapshotDb");

const DEFAULTS = {
  timezone: process.env.SNAPSHOT_TIMEZONE || "Asia/Singapore",
  blobPrefixRoot: process.env.SNAPSHOT_BLOB_PREFIX || "snapshots",
  blobAccess: process.env.SNAPSHOT_BLOB_ACCESS || "public",
  snapshotDate: process.env.SNAPSHOT_DATE_OVERRIDE || "",
  pageLimit: Number.parseInt(process.env.SNAPSHOT_PAGE_LIMIT || "5000", 10),
  maxPages: Number.parseInt(process.env.SNAPSHOT_MAX_PAGES || "5000", 10),
  pageDelayMs: Number.parseInt(process.env.SNAPSHOT_PAGE_DELAY_MS || "150", 10),
};

const SNAPSHOT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

const normalizeSnapshotDate = (value) => {
  if (!value) return "";
  const snapshotDate = String(value).trim();
  if (!SNAPSHOT_DATE_RE.test(snapshotDate)) {
    throw new Error("Invalid snapshot date override. Expected YYYY-MM-DD.");
  }
  return snapshotDate;
};

const createGzipWriter = async (filePath) => {
  const gzip = zlib.createGzip();
  const fileStream = fs.createWriteStream(filePath);
  const done = pipeline(gzip, fileStream);
  return { gzip, done };
};

const uploadFile = async (blobPath, filePath, contentType, blobAccess) => {
  const stream = fs.createReadStream(filePath);
  const result = await put(blobPath, stream, {
    access: blobAccess,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });
  return result.url;
};

const escapeCsvCell = (value) => {
  if (value === undefined || value === null) return "";
  const text = String(value);
  const escaped = text.replace(/"/g, '""');
  if (/[",\n]/.test(escaped) || /^\s|\s$/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
};

const writeCsvRow = (stream, cells) => {
  stream.write(`${cells.map((c) => escapeCsvCell(c)).join(",")}\n`);
};

const fetchToGzipFile = async ({
  obj,
  params = {},
  apiKey,
  filePath,
  limit,
  maxPages,
  pageDelayMs,
}) => {
  const { gzip, done } = await createGzipWriter(filePath);
  let rowCount = 0;

  await fetchAllPages({
    obj,
    params,
    apiKey,
    limit,
    maxPages,
    pageDelayMs,
    onPage: async (rows) => {
      rows.forEach((row) => {
        gzip.write(`${JSON.stringify(row)}\n`);
        rowCount += 1;
      });
    },
  });

  gzip.end();
  await done;
  return rowCount;
};

const validateEnv = () => {
  if (!process.env.PEERINGDB_API_KEY) {
    throw new Error("Missing PEERINGDB_API_KEY");
  }
  if (
    !process.env.POSTGRES_URL &&
    !process.env.POSTGRES_PRISMA_URL &&
    !process.env.DATABASE_URL &&
    !process.env.DATABASE_URL_UNPOOLED
  ) {
    throw new Error("Missing Postgres connection string");
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Missing BLOB_READ_WRITE_TOKEN");
  }
};

const runGlobalSnapshot = async ({ force = false, now = new Date(), config = {} } = {}) => {
  validateEnv();

  const snapshotConfig = {
    ...DEFAULTS,
    ...config,
  };

  const snapshotDateOverride = normalizeSnapshotDate(snapshotConfig.snapshotDate);
  const snapshotDate = snapshotDateOverride || formatDateInTz(now, snapshotConfig.timezone);

  if (!force && !snapshotDateOverride && !isLastDayOfMonth(now, snapshotConfig.timezone)) {
    return {
      ok: true,
      skipped: true,
      reason: "Not last day of month",
      snapshotDate,
      timezone: snapshotConfig.timezone,
    };
  }

  await ensureSchema();
  const existing = await getRun(snapshotDate);
  if (existing && !force) {
    return {
      ok: true,
      skipped: true,
      reason: "Snapshot already exists",
      snapshotDate,
      timezone: snapshotConfig.timezone,
    };
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

  try {
    const tmpDir = "/tmp";
    const netPath = path.join(tmpDir, `pdb-net-${snapshotDate}.jsonl.gz`);
    const orgPath = path.join(tmpDir, `pdb-org-${snapshotDate}.jsonl.gz`);
    const ixPath = path.join(tmpDir, `pdb-ix-${snapshotDate}.jsonl.gz`);
    const facPath = path.join(tmpDir, `pdb-fac-${snapshotDate}.jsonl.gz`);
    const netixlanPath = path.join(tmpDir, `pdb-netixlan-${snapshotDate}.jsonl.gz`);
    const netfacPath = path.join(tmpDir, `pdb-netfac-${snapshotDate}.jsonl.gz`);
    const networksCsvPath = path.join(tmpDir, `pdb-networks-${snapshotDate}.csv`);

    const { gzip: netGzip, done: netDone } = await createGzipWriter(netPath);
    const { gzip: orgGzip, done: orgDone } = await createGzipWriter(orgPath);

    const typeCounts = new Map();
    const orgIdCounts = new Map();
    const netRowsForCsv = [];
    let netCount = 0;

    await fetchAllPages({
      obj: "net",
      params: {},
      apiKey: process.env.PEERINGDB_API_KEY,
      limit: snapshotConfig.pageLimit,
      maxPages: snapshotConfig.maxPages,
      pageDelayMs: snapshotConfig.pageDelayMs,
      onPage: async (rows) => {
        rows.forEach((row) => {
          netGzip.write(`${JSON.stringify(row)}\n`);
          netCount += 1;
          const infoType = row.info_type || "unknown";
          typeCounts.set(infoType, (typeCounts.get(infoType) || 0) + 1);
          if (row.org_id) {
            orgIdCounts.set(row.org_id, (orgIdCounts.get(row.org_id) || 0) + 1);
          }
          netRowsForCsv.push({
            networkId: row.id,
            asn: row.asn || "",
            networkName: row.name || "",
            networkType: row.info_type || "unknown",
            status: row.status || "",
            website: row.website || "",
            orgId: row.org_id || "",
          });
        });
      },
    });

    netGzip.end();
    await netDone;

    const countryCounts = new Map();
    const orgLookup = new Map();
    let orgCount = 0;

    await fetchAllPages({
      obj: "org",
      params: {},
      apiKey: process.env.PEERINGDB_API_KEY,
      limit: snapshotConfig.pageLimit,
      maxPages: snapshotConfig.maxPages,
      pageDelayMs: snapshotConfig.pageDelayMs,
      onPage: async (rows) => {
        rows.forEach((row) => {
          orgGzip.write(`${JSON.stringify(row)}\n`);
          orgCount += 1;
          const count = orgIdCounts.get(row.id);
          if (count) {
            const country = row.country || "unknown";
            countryCounts.set(country, (countryCounts.get(country) || 0) + count);
          }
          orgLookup.set(row.id, {
            name: row.name || "",
            country: row.country || "",
            city: row.city || "",
          });
        });
      },
    });

    orgGzip.end();
    await orgDone;

    const blobPrefix = `${snapshotConfig.blobPrefixRoot}/${snapshotDate}`;
    const netUrl = await uploadFile(
      `${blobPrefix}/net.jsonl.gz`,
      netPath,
      "application/gzip",
      snapshotConfig.blobAccess
    );
    const orgUrl = await uploadFile(
      `${blobPrefix}/org.jsonl.gz`,
      orgPath,
      "application/gzip",
      snapshotConfig.blobAccess
    );
    const ixCount = await fetchToGzipFile({
      obj: "ix",
      apiKey: process.env.PEERINGDB_API_KEY,
      filePath: ixPath,
      limit: snapshotConfig.pageLimit,
      maxPages: snapshotConfig.maxPages,
      pageDelayMs: snapshotConfig.pageDelayMs,
    });
    const facCount = await fetchToGzipFile({
      obj: "fac",
      apiKey: process.env.PEERINGDB_API_KEY,
      filePath: facPath,
      limit: snapshotConfig.pageLimit,
      maxPages: snapshotConfig.maxPages,
      pageDelayMs: snapshotConfig.pageDelayMs,
    });
    const netixlanCount = await fetchToGzipFile({
      obj: "netixlan",
      apiKey: process.env.PEERINGDB_API_KEY,
      filePath: netixlanPath,
      limit: snapshotConfig.pageLimit,
      maxPages: snapshotConfig.maxPages,
      pageDelayMs: snapshotConfig.pageDelayMs,
    });
    const netfacCount = await fetchToGzipFile({
      obj: "netfac",
      apiKey: process.env.PEERINGDB_API_KEY,
      filePath: netfacPath,
      limit: snapshotConfig.pageLimit,
      maxPages: snapshotConfig.maxPages,
      pageDelayMs: snapshotConfig.pageDelayMs,
    });
    const ixUrl = await uploadFile(
      `${blobPrefix}/ix.jsonl.gz`,
      ixPath,
      "application/gzip",
      snapshotConfig.blobAccess
    );
    const facUrl = await uploadFile(
      `${blobPrefix}/fac.jsonl.gz`,
      facPath,
      "application/gzip",
      snapshotConfig.blobAccess
    );
    const netixlanUrl = await uploadFile(
      `${blobPrefix}/netixlan.jsonl.gz`,
      netixlanPath,
      "application/gzip",
      snapshotConfig.blobAccess
    );
    const netfacUrl = await uploadFile(
      `${blobPrefix}/netfac.jsonl.gz`,
      netfacPath,
      "application/gzip",
      snapshotConfig.blobAccess
    );
    const csvStream = fs.createWriteStream(networksCsvPath, { encoding: "utf8" });
    writeCsvRow(csvStream, [
      "snapshot_date",
      "asn",
      "network_id",
      "network_name",
      "network_type",
      "network_status",
      "network_website",
      "org_id",
      "org_name",
      "org_country",
      "org_city",
    ]);
    netRowsForCsv.forEach((row) => {
      const org = orgLookup.get(row.orgId) || {};
      writeCsvRow(csvStream, [
        snapshotDate,
        row.asn,
        row.networkId,
        row.networkName,
        row.networkType,
        row.status,
        row.website,
        row.orgId,
        org.name || "",
        org.country || "",
        org.city || "",
      ]);
    });
    await new Promise((resolve, reject) => {
      csvStream.on("finish", resolve);
      csvStream.on("error", reject);
      csvStream.end();
    });
    const networksCsvUrl = await uploadFile(
      `${blobPrefix}/networks.csv`,
      networksCsvPath,
      "text/csv; charset=utf-8",
      snapshotConfig.blobAccess
    );

    const manifest = {
      snapshot_date: snapshotDate,
      generated_at: now.toISOString(),
      timezone: snapshotConfig.timezone,
      net_count: netCount,
      org_count: orgCount,
      ix_count: ixCount,
      fac_count: facCount,
      netixlan_count: netixlanCount,
      netfac_count: netfacCount,
      files: {
        net: netUrl,
        org: orgUrl,
        ix: ixUrl,
        fac: facUrl,
        netixlan: netixlanUrl,
        netfac: netfacUrl,
        networks_csv: networksCsvUrl,
      },
    };

    const manifestResult = await put(`${blobPrefix}/manifest.json`, JSON.stringify(manifest, null, 2), {
      access: snapshotConfig.blobAccess,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });

    await insertTypeCounts(snapshotDate, typeCounts);
    await insertCountryCounts(snapshotDate, countryCounts);

    await upsertRunWithUrls({
      snapshotDate,
      status: "complete",
      startedAt: now.toISOString(),
      completedAt: new Date().toISOString(),
      netCount,
      orgCount,
      blobPrefix,
      netUrl,
      orgUrl,
      manifestUrl: manifestResult.url,
      networksCsvUrl,
    });

    return {
      ok: true,
      skipped: false,
      snapshotDate,
      timezone: snapshotConfig.timezone,
      netCount,
      orgCount,
      blobPrefix,
    };
  } catch (err) {
    await upsertRun({
      snapshotDate,
      status: "error",
      startedAt: now.toISOString(),
      completedAt: new Date().toISOString(),
      netCount: null,
      orgCount: null,
      blobPrefix: null,
    });
    throw err;
  }
};

module.exports = {
  formatDateInTz,
  isLastDayOfMonth,
  runGlobalSnapshot,
};
