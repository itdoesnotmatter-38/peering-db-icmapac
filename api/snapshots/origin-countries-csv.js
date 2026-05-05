const zlib = require("zlib");

const {
  ensureSchema,
  getRunDetails,
  listOriginCountryCounts,
} = require("../_lib/snapshotDb");

const isValidSnapshotDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "");

const escapeCsvCell = (value) => {
  if (value === undefined || value === null) return "";
  const text = String(value);
  const escaped = text.replace(/"/g, '""');
  if (/[",\n]/.test(escaped) || /^\s|\s$/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
};

const toCsv = (rows) => rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")).join("\n");

const normalizeCountry = (value) => {
  const country = String(value || "").trim().toUpperCase();
  return country || "UNKNOWN";
};

const fetchJsonlGzip = async (url) => {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download snapshot source: ${resp.status}`);
  }

  const compressed = Buffer.from(await resp.arrayBuffer());
  const text = zlib.gunzipSync(compressed).toString("utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const buildCountsFromSources = async (run) => {
  if (!run.net_url || !run.org_url) {
    throw new Error("Snapshot source files are not available for this date");
  }

  const [nets, orgs] = await Promise.all([
    fetchJsonlGzip(run.net_url),
    fetchJsonlGzip(run.org_url),
  ]);
  const orgCountryLookup = new Map(orgs.map((org) => [org.id, normalizeCountry(org.country)]));
  const counts = new Map();

  nets.forEach((net) => {
    const country = orgCountryLookup.get(net.org_id) || "UNKNOWN";
    counts.set(country, (counts.get(country) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.country.localeCompare(b.country);
    });
};

module.exports = async (req, res) => {
  const snapshotDate = String(req.query?.snapshotDate || "");

  if (!isValidSnapshotDate(snapshotDate)) {
    res.status(400).json({ error: "Missing or invalid snapshotDate (expected YYYY-MM-DD)" });
    return;
  }

  try {
    await ensureSchema();
    const run = await getRunDetails(snapshotDate);

    if (!run) {
      res.status(404).json({ error: "Snapshot not found" });
      return;
    }

    let counts = await listOriginCountryCounts(snapshotDate);
    if (counts.length === 0) {
      counts = await buildCountsFromSources(run);
    }

    const rows = [
      ["snapshot_date", "origin_country", "network_count"],
      ...counts.map((row) => [snapshotDate, normalizeCountry(row.country), row.count]),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="peeringdb-snapshot-${snapshotDate}-origin-countries.csv"`
    );
    res.status(200).send(toCsv(rows));
  } catch (err) {
    console.error("Failed to generate origin countries CSV", err);
    res.status(500).json({ error: err?.message || "Failed to generate origin countries CSV" });
  }
};
