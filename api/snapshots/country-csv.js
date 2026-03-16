const zlib = require("zlib");

const { ensureSchema, getRunDetails } = require("../_lib/snapshotDb");

const isValidSnapshotDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "");
const normalizeCountry = (value) => String(value || "").trim().toUpperCase();

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

const fetchJson = async (url) => {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download snapshot manifest: ${resp.status}`);
  }
  return resp.json();
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

const requireFileUrl = (manifest, key) => {
  const value = manifest?.files?.[key];
  if (!value) {
    throw new Error(`Snapshot is missing stored ${key} data. Re-run the snapshot with the current pipeline.`);
  }
  return value;
};

const buildIxView = ({ snapshotDate, country, ixRows, netixlanRows, netRows }) => {
  const ixLookup = new Map(ixRows.map((ix) => [ix.id, ix]));
  const netLookup = new Map(netRows.map((net) => [net.id, net]));
  const filteredIxIds = new Set(ixRows.filter((ix) => ix.country === country).map((ix) => ix.id));
  const filteredRows = netixlanRows.filter((row) => filteredIxIds.has(row.ix_id));

  return [
    [
      "snapshot_date",
      "country",
      "ix_id",
      "ix_name",
      "ix_city",
      "network_id",
      "asn",
      "network_name",
      "network_type",
      "speed_mbps",
      "ipaddr4",
      "ipaddr6",
    ],
    ...filteredRows.map((row) => {
      const ix = ixLookup.get(row.ix_id) || {};
      const net = netLookup.get(row.net_id) || {};
      return [
        snapshotDate,
        country,
        row.ix_id || "",
        ix.name || "",
        ix.city || "",
        row.net_id || "",
        net.asn || row.asn || "",
        net.name || "",
        net.info_type || "",
        row.speed || "",
        row.ipaddr4 || "",
        row.ipaddr6 || "",
      ];
    }),
  ];
};

const buildFacilityView = ({ snapshotDate, country, facRows, netfacRows, netRows }) => {
  const facLookup = new Map(facRows.map((fac) => [fac.id, fac]));
  const netLookup = new Map(netRows.map((net) => [net.id, net]));
  const filteredFacIds = new Set(facRows.filter((fac) => fac.country === country).map((fac) => fac.id));
  const filteredRows = netfacRows.filter((row) => filteredFacIds.has(row.fac_id));

  return [
    [
      "snapshot_date",
      "country",
      "facility_id",
      "facility_name",
      "facility_city",
      "network_id",
      "asn",
      "network_name",
      "network_type",
    ],
    ...filteredRows.map((row) => {
      const fac = facLookup.get(row.fac_id) || {};
      const net = netLookup.get(row.net_id) || {};
      return [
        snapshotDate,
        country,
        row.fac_id || "",
        fac.name || "",
        fac.city || "",
        row.net_id || "",
        net.asn || "",
        net.name || "",
        net.info_type || "",
      ];
    }),
  ];
};

module.exports = async (req, res) => {
  const snapshotDate = String(req.query?.snapshotDate || "");
  const country = normalizeCountry(req.query?.country);
  const view = String(req.query?.view || "").trim().toLowerCase();

  if (!isValidSnapshotDate(snapshotDate)) {
    res.status(400).json({ error: "Missing or invalid snapshotDate (expected YYYY-MM-DD)" });
    return;
  }
  if (!country || country.length !== 2) {
    res.status(400).json({ error: "Missing or invalid country code (expected ISO alpha-2)" });
    return;
  }
  if (view !== "ix" && view !== "facility") {
    res.status(400).json({ error: "Missing or invalid view (expected ix or facility)" });
    return;
  }

  try {
    await ensureSchema();
    const run = await getRunDetails(snapshotDate);
    if (!run) {
      res.status(404).json({ error: "Snapshot not found" });
      return;
    }
    if (!run.manifest_url) {
      res.status(404).json({ error: "Snapshot manifest is not available for this date" });
      return;
    }

    const manifest = await fetchJson(run.manifest_url);
    const netUrl = requireFileUrl(manifest, "net");

    if (view === "ix") {
      const [ixRows, netixlanRows, netRows] = await Promise.all([
        fetchJsonlGzip(requireFileUrl(manifest, "ix")),
        fetchJsonlGzip(requireFileUrl(manifest, "netixlan")),
        fetchJsonlGzip(netUrl),
      ]);
      const rows = buildIxView({ snapshotDate, country, ixRows, netixlanRows, netRows });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="peeringdb-snapshot-${snapshotDate}-ix-${country}.csv"`
      );
      res.status(200).send(toCsv(rows));
      return;
    }

    const [facRows, netfacRows, netRows] = await Promise.all([
      fetchJsonlGzip(requireFileUrl(manifest, "fac")),
      fetchJsonlGzip(requireFileUrl(manifest, "netfac")),
      fetchJsonlGzip(netUrl),
    ]);
    const rows = buildFacilityView({ snapshotDate, country, facRows, netfacRows, netRows });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="peeringdb-snapshot-${snapshotDate}-facility-${country}.csv"`
    );
    res.status(200).send(toCsv(rows));
  } catch (err) {
    console.error("Failed to generate snapshot country CSV", err);
    res.status(500).json({ error: err?.message || "Failed to generate snapshot country CSV" });
  }
};
