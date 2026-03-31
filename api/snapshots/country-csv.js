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
    throw new Error(`Snapshot is missing stored ${key} data for this export.`);
  }
  return value;
};

const normalizeText = (value) => String(value || "").trim();
const uniqueSorted = (values) =>
  Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );

const buildIxViewRows = ({ snapshotDate, country, ixRows, netixlanRows, netRows }) => {
  const ixLookup = new Map(ixRows.map((ix) => [ix.id, ix]));
  const netLookup = new Map(netRows.map((net) => [net.id, net]));
  const ixIds = new Set(ixRows.filter((ix) => ix.country === country).map((ix) => ix.id));
  const rowsByNet = new Map();

  netixlanRows
    .filter((row) => ixIds.has(row.ix_id))
    .forEach((row) => {
      const key = row.net_id;
      if (!key) return;
      if (!rowsByNet.has(key)) {
        rowsByNet.set(key, {
          ixIds: new Set(),
          ixNames: new Set(),
          ixCities: new Set(),
          deployedCapacityMbps: 0,
        });
      }
      const bucket = rowsByNet.get(key);
      const ix = ixLookup.get(row.ix_id) || {};
      bucket.ixIds.add(String(row.ix_id));
      if (ix.name) bucket.ixNames.add(ix.name);
      if (ix.city) bucket.ixCities.add(ix.city);
      const speed = Number(row.speed);
      if (Number.isFinite(speed)) {
        bucket.deployedCapacityMbps += speed;
      }
    });

  const rows = Array.from(rowsByNet.entries())
    .map(([netId, summary]) => {
      const net = netLookup.get(netId) || {};
      const ixIdsList = uniqueSorted(Array.from(summary.ixIds));
      const ixNamesList = uniqueSorted(Array.from(summary.ixNames));
      const ixCitiesList = uniqueSorted(Array.from(summary.ixCities));
      return [
        snapshotDate,
        country,
        netId,
        net.asn || "",
        net.name || "",
        net.info_type || "",
        ixIdsList.length,
        ixIdsList.join(" | "),
        ixNamesList.join(" | "),
        ixCitiesList.join(" | "),
        summary.deployedCapacityMbps,
      ];
    })
    .sort((a, b) => {
      const asnA = Number(a[3]) || 0;
      const asnB = Number(b[3]) || 0;
      if (asnA !== asnB) return asnA - asnB;
      return String(a[4]).localeCompare(String(b[4]));
    });

  return [
    [
      "snapshot_date",
      "country",
      "network_id",
      "asn",
      "network_name",
      "network_type",
      "ix_count",
      "ix_ids",
      "ix_names",
      "ix_cities",
      "deployed_capacity_mbps",
    ],
    ...rows,
  ];
};

const buildFacilityViewRows = ({ snapshotDate, country, facRows, netfacRows, netRows }) => {
  const facLookup = new Map(facRows.map((fac) => [fac.id, fac]));
  const netLookup = new Map(netRows.map((net) => [net.id, net]));
  const facIds = new Set(facRows.filter((fac) => fac.country === country).map((fac) => fac.id));
  const rowsByNet = new Map();

  netfacRows
    .filter((row) => facIds.has(row.fac_id))
    .forEach((row) => {
      const key = row.net_id;
      if (!key) return;
      if (!rowsByNet.has(key)) {
        rowsByNet.set(key, {
          facilityIds: new Set(),
          facilityNames: new Set(),
          facilityCities: new Set(),
        });
      }
      const bucket = rowsByNet.get(key);
      const fac = facLookup.get(row.fac_id) || {};
      bucket.facilityIds.add(String(row.fac_id));
      if (fac.name) bucket.facilityNames.add(fac.name);
      if (fac.city) bucket.facilityCities.add(fac.city);
    });

  const rows = Array.from(rowsByNet.entries())
    .map(([netId, summary]) => {
      const net = netLookup.get(netId) || {};
      const facilityIds = uniqueSorted(Array.from(summary.facilityIds));
      const facilityNames = uniqueSorted(Array.from(summary.facilityNames));
      const facilityCities = uniqueSorted(Array.from(summary.facilityCities));
      return [
        snapshotDate,
        country,
        netId,
        net.asn || "",
        net.name || "",
        net.info_type || "",
        facilityIds.length,
        facilityIds.join(" | "),
        facilityNames.join(" | "),
        facilityCities.join(" | "),
      ];
    })
    .sort((a, b) => {
      const asnA = Number(a[3]) || 0;
      const asnB = Number(b[3]) || 0;
      if (asnA !== asnB) return asnA - asnB;
      return String(a[4]).localeCompare(String(b[4]));
    });

  return [
    [
      "snapshot_date",
      "country",
      "network_id",
      "asn",
      "network_name",
      "network_type",
      "facility_count",
      "facility_ids",
      "facility_names",
      "facility_cities",
    ],
    ...rows,
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
      const rows = buildIxViewRows({ snapshotDate, country, ixRows, netixlanRows, netRows });
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
    const rows = buildFacilityViewRows({ snapshotDate, country, facRows, netfacRows, netRows });
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
