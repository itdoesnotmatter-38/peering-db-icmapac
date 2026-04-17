const zlib = require("zlib");

const { ensureSchema, getRunDetails } = require("../_lib/snapshotDb");

const isValidSnapshotDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "");
const normalizeCountry = (value) => String(value || "").trim().toUpperCase();
const normalizeRegion = (value) => String(value || "").trim().toUpperCase();

const REGION_COUNTRIES = {
  APAC: ["AU", "HK", "ID", "IN", "JP", "KR", "MY", "PH", "SG", "TH"],
  EMEA: ["DE", "ES", "FR", "GB", "NL"],
  AMER: ["US"],
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
const marketKeyFor = (country, city) => `${normalizeText(country).toUpperCase()}::${normalizeText(city)}`;

const buildIxSummaries = ({ countries, ixRows, netixlanRows }) => {
  const ixLookup = new Map(ixRows.map((ix) => [ix.id, ix]));
  const countrySet = new Set(countries);
  const ixIds = new Set(ixRows.filter((ix) => countrySet.has(ix.country)).map((ix) => ix.id));
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
          ixCountries: new Set(),
          deployedCapacityMbps: 0,
        });
      }
      const bucket = rowsByNet.get(key);
      const ix = ixLookup.get(row.ix_id) || {};
      bucket.ixIds.add(String(row.ix_id));
      if (ix.name) bucket.ixNames.add(ix.name);
      if (ix.city) bucket.ixCities.add(ix.city);
      if (ix.country) bucket.ixCountries.add(ix.country);
      const speed = Number(row.speed);
      if (Number.isFinite(speed)) {
        bucket.deployedCapacityMbps += speed;
      }
    });

  return rowsByNet;
};

const buildFacilitySummaries = ({ countries, facRows, netfacRows }) => {
  const facLookup = new Map(facRows.map((fac) => [fac.id, fac]));
  const countrySet = new Set(countries);
  const facIds = new Set(facRows.filter((fac) => countrySet.has(fac.country)).map((fac) => fac.id));
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
          facilityCountries: new Set(),
        });
      }
      const bucket = rowsByNet.get(key);
      const fac = facLookup.get(row.fac_id) || {};
      bucket.facilityIds.add(String(row.fac_id));
      if (fac.name) bucket.facilityNames.add(fac.name);
      if (fac.city) bucket.facilityCities.add(fac.city);
      if (fac.country) bucket.facilityCountries.add(fac.country);
    });

  return rowsByNet;
};

const buildIxViewRows = ({ snapshotDate, scopeType, scopeCode, countries, ixRows, netixlanRows, netRows }) => {
  const netLookup = new Map(netRows.map((net) => [net.id, net]));
  const rowsByNet = buildIxSummaries({ countries, ixRows, netixlanRows });

  const rows = Array.from(rowsByNet.entries())
    .map(([netId, summary]) => {
      const net = netLookup.get(netId) || {};
      const ixIdsList = uniqueSorted(Array.from(summary.ixIds));
      const ixNamesList = uniqueSorted(Array.from(summary.ixNames));
      const ixCitiesList = uniqueSorted(Array.from(summary.ixCities));
      const ixCountriesList = uniqueSorted(Array.from(summary.ixCountries));
      return [
        snapshotDate,
        scopeCode,
        netId,
        net.asn || "",
        net.name || "",
        net.info_type || "",
        ixIdsList.length,
        ixIdsList.join(" | "),
        ixNamesList.join(" | "),
        ixCitiesList.join(" | "),
        ixCountriesList.join(" | "),
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
      scopeType,
      "network_id",
      "asn",
      "network_name",
      "network_type",
      "ix_count",
      "ix_ids",
      "ix_names",
      "ix_cities",
      "ix_countries",
      "deployed_capacity_mbps",
    ],
    ...rows,
  ];
};

const buildFacilityViewRows = ({ snapshotDate, scopeType, scopeCode, countries, facRows, netfacRows, netRows }) => {
  const netLookup = new Map(netRows.map((net) => [net.id, net]));
  const rowsByNet = buildFacilitySummaries({ countries, facRows, netfacRows });

  const rows = Array.from(rowsByNet.entries())
    .map(([netId, summary]) => {
      const net = netLookup.get(netId) || {};
      const facilityIds = uniqueSorted(Array.from(summary.facilityIds));
      const facilityNames = uniqueSorted(Array.from(summary.facilityNames));
      const facilityCities = uniqueSorted(Array.from(summary.facilityCities));
      const facilityCountries = uniqueSorted(Array.from(summary.facilityCountries));
      return [
        snapshotDate,
        scopeCode,
        netId,
        net.asn || "",
        net.name || "",
        net.info_type || "",
        facilityIds.length,
        facilityIds.join(" | "),
        facilityNames.join(" | "),
        facilityCities.join(" | "),
        facilityCountries.join(" | "),
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
      scopeType,
      "network_id",
      "asn",
      "network_name",
      "network_type",
      "facility_count",
      "facility_ids",
      "facility_names",
      "facility_cities",
      "facility_countries",
    ],
    ...rows,
  ];
};

const buildCombinedViewRows = ({
  snapshotDate,
  scopeType,
  scopeCode,
  countries,
  ixRows,
  facRows,
  netixlanRows,
  netfacRows,
  netRows,
}) => {
  const netLookup = new Map(netRows.map((net) => [net.id, net]));
  const ixLookup = new Map(ixRows.map((ix) => [ix.id, ix]));
  const facLookup = new Map(facRows.map((fac) => [fac.id, fac]));
  const countrySet = new Set(countries);
  const rowsByNetMarket = new Map();

  const ensureBucket = (netId, marketCountry, marketCity) => {
    const key = `${netId}::${marketKeyFor(marketCountry, marketCity)}`;
    if (!rowsByNetMarket.has(key)) {
      rowsByNetMarket.set(key, {
        netId,
        marketCountry: normalizeText(marketCountry).toUpperCase(),
        marketCity: normalizeText(marketCity),
        ixIds: new Set(),
        ixNames: new Set(),
        ixCities: new Set(),
        ixCountries: new Set(),
        deployedCapacityMbps: 0,
        facilityIds: new Set(),
        facilityNames: new Set(),
        facilityCities: new Set(),
        facilityCountries: new Set(),
      });
    }
    return rowsByNetMarket.get(key);
  };

  netixlanRows.forEach((row) => {
    const ix = ixLookup.get(row.ix_id);
    if (!ix || !countrySet.has(ix.country) || !row.net_id) return;
    const bucket = ensureBucket(row.net_id, ix.country, ix.city);
    bucket.ixIds.add(String(row.ix_id));
    if (ix.name) bucket.ixNames.add(ix.name);
    if (ix.city) bucket.ixCities.add(ix.city);
    if (ix.country) bucket.ixCountries.add(ix.country);
    const speed = Number(row.speed);
    if (Number.isFinite(speed)) {
      bucket.deployedCapacityMbps += speed;
    }
  });

  netfacRows.forEach((row) => {
    const fac = facLookup.get(row.fac_id);
    if (!fac || !countrySet.has(fac.country) || !row.net_id) return;
    const bucket = ensureBucket(row.net_id, fac.country, fac.city);
    bucket.facilityIds.add(String(row.fac_id));
    if (fac.name) bucket.facilityNames.add(fac.name);
    if (fac.city) bucket.facilityCities.add(fac.city);
    if (fac.country) bucket.facilityCountries.add(fac.country);
  });

  const rows = Array.from(rowsByNetMarket.values())
    .map((summary) => {
      const net = netLookup.get(summary.netId) || {};
      const ixIdsList = uniqueSorted(Array.from(summary.ixIds));
      const ixNamesList = uniqueSorted(Array.from(summary.ixNames));
      const ixCitiesList = uniqueSorted(Array.from(summary.ixCities));
      const ixCountriesList = uniqueSorted(Array.from(summary.ixCountries));
      const facilityIds = uniqueSorted(Array.from(summary.facilityIds));
      const facilityNames = uniqueSorted(Array.from(summary.facilityNames));
      const facilityCities = uniqueSorted(Array.from(summary.facilityCities));
      const facilityCountries = uniqueSorted(Array.from(summary.facilityCountries));

      return [
        snapshotDate,
        scopeCode,
        summary.marketCountry,
        summary.marketCity,
        summary.netId,
        net.asn || "",
        net.name || "",
        net.info_type || "",
        ixIdsList.length,
        ixIdsList.join(" | "),
        ixNamesList.join(" | "),
        ixCitiesList.join(" | "),
        ixCountriesList.join(" | "),
        summary.deployedCapacityMbps,
        facilityIds.length,
        facilityIds.join(" | "),
        facilityNames.join(" | "),
        facilityCities.join(" | "),
        facilityCountries.join(" | "),
      ];
    })
    .sort((a, b) => {
      const countryCmp = String(a[2]).localeCompare(String(b[2]));
      if (countryCmp !== 0) return countryCmp;
      const cityCmp = String(a[3]).localeCompare(String(b[3]));
      if (cityCmp !== 0) return cityCmp;
      const asnA = Number(a[5]) || 0;
      const asnB = Number(b[5]) || 0;
      if (asnA !== asnB) return asnA - asnB;
      return String(a[6]).localeCompare(String(b[6]));
    });

  return [
    [
      "snapshot_date",
      scopeType,
      "market_country",
      "market_city",
      "network_id",
      "asn",
      "network_name",
      "network_type",
      "ix_count",
      "ix_ids",
      "ix_names",
      "ix_cities",
      "ix_countries",
      "deployed_capacity_mbps",
      "facility_count",
      "facility_ids",
      "facility_names",
      "facility_cities",
      "facility_countries",
    ],
    ...rows,
  ];
};

module.exports = async (req, res) => {
  const snapshotDate = String(req.query?.snapshotDate || "");
  const country = normalizeCountry(req.query?.country);
  const region = normalizeRegion(req.query?.region);
  const view = String(req.query?.view || "").trim().toLowerCase();

  if (!isValidSnapshotDate(snapshotDate)) {
    res.status(400).json({ error: "Missing or invalid snapshotDate (expected YYYY-MM-DD)" });
    return;
  }
  if ((country && region) || (!country && !region)) {
    res.status(400).json({ error: "Provide exactly one export scope: country=ISO alpha-2 or region=APAC|EMEA|AMER" });
    return;
  }
  if (view !== "ix" && view !== "facility" && view !== "combined") {
    res.status(400).json({ error: "Missing or invalid view (expected ix, facility, or combined)" });
    return;
  }

  let scopeType = "country";
  let scopeCode = country;
  let countries = [];

  if (country) {
    if (country.length !== 2) {
      res.status(400).json({ error: "Missing or invalid country code (expected ISO alpha-2)" });
      return;
    }
    countries = [country];
  } else {
    const regionCountries = REGION_COUNTRIES[region];
    if (!regionCountries) {
      res.status(400).json({ error: "Missing or invalid region (expected APAC, EMEA, or AMER)" });
      return;
    }
    scopeType = "region";
    scopeCode = region;
    countries = regionCountries;
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
      const rows = buildIxViewRows({ snapshotDate, scopeType, scopeCode, countries, ixRows, netixlanRows, netRows });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="peeringdb-snapshot-${snapshotDate}-ix-${scopeCode}.csv"`
      );
      res.status(200).send(toCsv(rows));
      return;
    }

    if (view === "facility") {
      const [facRows, netfacRows, netRows] = await Promise.all([
        fetchJsonlGzip(requireFileUrl(manifest, "fac")),
        fetchJsonlGzip(requireFileUrl(manifest, "netfac")),
        fetchJsonlGzip(netUrl),
      ]);
      const rows = buildFacilityViewRows({
        snapshotDate,
        scopeType,
        scopeCode,
        countries,
        facRows,
        netfacRows,
        netRows,
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="peeringdb-snapshot-${snapshotDate}-facility-${scopeCode}.csv"`
      );
      res.status(200).send(toCsv(rows));
      return;
    }

    const [ixRows, facRows, netixlanRows, netfacRows, netRows] = await Promise.all([
      fetchJsonlGzip(requireFileUrl(manifest, "ix")),
      fetchJsonlGzip(requireFileUrl(manifest, "fac")),
      fetchJsonlGzip(requireFileUrl(manifest, "netixlan")),
      fetchJsonlGzip(requireFileUrl(manifest, "netfac")),
      fetchJsonlGzip(netUrl),
    ]);
    const rows = buildCombinedViewRows({
      snapshotDate,
      scopeType,
      scopeCode,
      countries,
      ixRows,
      facRows,
      netixlanRows,
      netfacRows,
      netRows,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="peeringdb-snapshot-${snapshotDate}-combined-${scopeCode}.csv"`
    );
    res.status(200).send(toCsv(rows));
  } catch (err) {
    console.error("Failed to generate snapshot country CSV", err);
    res.status(500).json({ error: err?.message || "Failed to generate snapshot country CSV" });
  }
};
