const zlib = require("zlib");

const { ensureSchema, listRecentCompleteRuns } = require("../_lib/snapshotDb");

const APAC_METROS = [
  { key: "Singapore", city: "Singapore", country: "SG", countryWide: true },
  {
    key: "Jakarta",
    city: "Jakarta",
    country: "ID",
    cityAliases: ["Jakarta Selatan", "Jakarta Pusat", "East Jakarta", "South Jakarta"],
  },
  { key: "Kuala Lumpur", city: "Kuala Lumpur", country: "MY", cityAliases: ["Cyberjaya", "Brickfields"] },
  {
    key: "Melbourne",
    city: "Melbourne",
    country: "AU",
    cityAliases: ["Derrimut", "Port Melbourne", "North Melbourne", "Deer Park", "Brooklyn"],
  },
  {
    key: "Sydney",
    city: "Sydney",
    country: "AU",
    cityAliases: ["Silverwater", "Unanderra", "Pyrmont", "Eastern Creek", "Erskine Park", "Artarmon"],
  },
  { key: "Mumbai", city: "Mumbai", country: "IN", cityAliases: ["Navi Mumbai", "Navi Mumbai,"] },
  // PeeringDB facilities in the Hong Kong metro are often listed under
  // surrounding districts (Kwai Chung, Tsuen Wan, Sha Tin, etc.).
  { key: "Hong Kong", city: "Hong Kong", country: "HK", countryWide: true },
  { key: "Bangkok", city: "Bangkok", country: "TH", cityAliases: ["Chon Buri", "Sathorn, Bangkok", "Chatuchak"] },
  { key: "Manila", city: "Manila", country: "PH", cityAliases: ["Binan Laguna"] },
  { key: "Chennai", city: "Chennai", country: "IN", cityAliases: ["Siruseri"] },
  { key: "Seoul", city: "Seoul", country: "KR", cityAliases: ["Mapo-gu", "Gangnam-gu", "Seongnam", "Incheon"] },
  { key: "Tokyo", city: "Tokyo", country: "JP", cityAliases: ["Inzai-City", "Bunkyo-Ku", "Mitaka-shi", "Yokohama, Kanagawa,"] },
  {
    key: "Osaka",
    city: "Osaka",
    country: "JP",
    cityAliases: ["Osaka-Shi Kita-Ku", "Ibaraki-city", "Minoo-shi", "Ibaraki-shi", "Minoo-shi, Osaka-Fu,"],
  },
  { key: "Perth", city: "Perth", country: "AU", cityAliases: ["Shenton Park", "East Perth"] },
];

const normalizeCity = (value) => String(value || "").trim().toLowerCase();

const metroKeyFor = (country, city) => {
  const normalizedCountry = String(country || "").trim().toUpperCase();
  const normalizedCity = normalizeCity(city);
  const metro = APAC_METROS.find(
    (entry) =>
      entry.country === normalizedCountry &&
      (entry.countryWide ||
        entry.city.toLowerCase() === normalizedCity ||
        (entry.cityAliases || []).some((alias) => normalizeCity(alias) === normalizedCity))
  );
  return metro?.key || "";
};

const toDateOnly = (value) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

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
    throw new Error(`Snapshot is missing stored ${key} data.`);
  }
  return value;
};

const getMissingSnapshotFiles = (manifest) =>
  ["ix", "fac", "netixlan", "netfac", "net"].filter((key) => !manifest?.files?.[key]);

const getOrCreate = (map, key, create) => {
  if (!map.has(key)) map.set(key, create());
  return map.get(key);
};

const toSortedArray = (set) => Array.from(set).sort((a, b) => String(a).localeCompare(String(b)));

const buildSnapshotTrends = ({ snapshotDate, ixRows, facRows, netixlanRows, netfacRows, netRows }) => {
  const netLookup = new Map(netRows.map((net) => [net.id, net]));
  const ixLookup = new Map();
  const facLookup = new Map();
  const metroTrendByKey = new Map();
  const ixTrendByKey = new Map();
  const facilityTrendByKey = new Map();
  const networkTrendByKey = new Map();
  const networkIxTrendByKey = new Map();

  APAC_METROS.forEach((metro) => {
    metroTrendByKey.set(metro.key, {
      snapshotDate,
      metro: metro.key,
      country: metro.country,
      city: metro.city,
      capacityMbps: 0,
      networkIds: new Set(),
      ixIds: new Set(),
      facilityIds: new Set(),
      facilityPresencePairs: new Set(),
    });
  });

  ixRows.forEach((ix) => {
    const metro = metroKeyFor(ix.country, ix.city);
    if (!metro) return;
    ixLookup.set(ix.id, { ...ix, metro });
    metroTrendByKey.get(metro)?.ixIds.add(ix.id);
  });

  facRows.forEach((fac) => {
    const metro = metroKeyFor(fac.country, fac.city);
    if (!metro) return;
    facLookup.set(fac.id, { ...fac, metro });
    metroTrendByKey.get(metro)?.facilityIds.add(fac.id);
  });

  netixlanRows.forEach((row) => {
    const ix = ixLookup.get(row.ix_id);
    if (!ix || !row.net_id) return;
    const speed = Number(row.speed);
    const capacityMbps = Number.isFinite(speed) ? speed : 0;
    const net = netLookup.get(row.net_id) || {};
    const metroSummary = metroTrendByKey.get(ix.metro);
    metroSummary.capacityMbps += capacityMbps;
    metroSummary.networkIds.add(row.net_id);

    const networkKey = `${snapshotDate}|${ix.metro}|${row.net_id}`;
    const network = getOrCreate(networkTrendByKey, networkKey, () => ({
      snapshotDate,
      metro: ix.metro,
      networkId: row.net_id,
      asn: net.asn || null,
      networkName: net.name || "",
      networkType: net.info_type || "",
      capacityMbps: 0,
      ixIds: new Set(),
      facilityIds: new Set(),
    }));
    network.capacityMbps += capacityMbps;
    network.ixIds.add(row.ix_id);

    const ixKey = `${snapshotDate}|${ix.metro}|${row.ix_id}`;
    const ixTrend = getOrCreate(ixTrendByKey, ixKey, () => ({
      snapshotDate,
      metro: ix.metro,
      ixId: row.ix_id,
      ixName: ix.name || "",
      capacityMbps: 0,
      networkIds: new Set(),
    }));
    ixTrend.capacityMbps += capacityMbps;
    ixTrend.networkIds.add(row.net_id);

    const networkIxKey = `${snapshotDate}|${ix.metro}|${row.net_id}|${row.ix_id}`;
    const networkIx = getOrCreate(networkIxTrendByKey, networkIxKey, () => ({
      snapshotDate,
      metro: ix.metro,
      networkId: row.net_id,
      asn: net.asn || null,
      networkName: net.name || "",
      ixId: row.ix_id,
      ixName: ix.name || "",
      capacityMbps: 0,
    }));
    networkIx.capacityMbps += capacityMbps;
  });

  netfacRows.forEach((row) => {
    const fac = facLookup.get(row.fac_id);
    if (!fac || !row.net_id) return;
    const net = netLookup.get(row.net_id) || {};
    const metroSummary = metroTrendByKey.get(fac.metro);
    metroSummary.networkIds.add(row.net_id);
    metroSummary.facilityPresencePairs.add(`${row.net_id}|${row.fac_id}`);

    const networkKey = `${snapshotDate}|${fac.metro}|${row.net_id}`;
    const network = getOrCreate(networkTrendByKey, networkKey, () => ({
      snapshotDate,
      metro: fac.metro,
      networkId: row.net_id,
      asn: net.asn || null,
      networkName: net.name || "",
      networkType: net.info_type || "",
      capacityMbps: 0,
      ixIds: new Set(),
      facilityIds: new Set(),
    }));
    network.facilityIds.add(row.fac_id);

    const facilityKey = `${snapshotDate}|${fac.metro}|${row.fac_id}`;
    const facilityTrend = getOrCreate(facilityTrendByKey, facilityKey, () => ({
      snapshotDate,
      metro: fac.metro,
      facilityId: row.fac_id,
      facilityName: fac.name || "",
      facilityOrgName: fac.org_name || "",
      networkIds: new Set(),
    }));
    facilityTrend.networkIds.add(row.net_id);
  });

  return {
    metroTrend: Array.from(metroTrendByKey.values()).map((row) => ({
      snapshotDate: row.snapshotDate,
      metro: row.metro,
      country: row.country,
      city: row.city,
      capacityMbps: row.capacityMbps,
      networkCount: row.networkIds.size,
      ixCount: row.ixIds.size,
      facilityCount: row.facilityIds.size,
      facilityPresenceCount: row.facilityPresencePairs.size,
    })),
    ixTrend: Array.from(ixTrendByKey.values()).map((row) => ({
      snapshotDate: row.snapshotDate,
      metro: row.metro,
      ixId: row.ixId,
      ixName: row.ixName,
      capacityMbps: row.capacityMbps,
      networkCount: row.networkIds.size,
    })),
    facilityTrend: Array.from(facilityTrendByKey.values()).map((row) => ({
      snapshotDate: row.snapshotDate,
      metro: row.metro,
      facilityId: row.facilityId,
      facilityName: row.facilityName,
      facilityOrgName: row.facilityOrgName,
      networkCount: row.networkIds.size,
    })),
    networkTrend: Array.from(networkTrendByKey.values()).map((row) => ({
      snapshotDate: row.snapshotDate,
      metro: row.metro,
      networkId: row.networkId,
      asn: row.asn,
      networkName: row.networkName,
      networkType: row.networkType,
      capacityMbps: row.capacityMbps,
      ixCount: row.ixIds.size,
      facilityCount: row.facilityIds.size,
      presenceType: row.ixIds.size > 0 && row.facilityIds.size > 0 ? "both" : row.ixIds.size > 0 ? "ix" : "facility",
    })),
    networkIxTrend: Array.from(networkIxTrendByKey.values()).map((row) => ({
      snapshotDate: row.snapshotDate,
      metro: row.metro,
      networkId: row.networkId,
      asn: row.asn,
      networkName: row.networkName,
      ixId: row.ixId,
      ixName: row.ixName,
      capacityMbps: row.capacityMbps,
    })),
  };
};

module.exports = async (req, res) => {
  const limit = Number.parseInt(String(req.query?.limit || "12"), 10);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 24)) : 12;

  try {
    await ensureSchema();
    const runs = await listRecentCompleteRuns(safeLimit);
    const completeRuns = runs
      .filter((run) => run.manifest_url)
      .map((run) => ({
        snapshotDate: toDateOnly(run.snapshot_date),
        manifestUrl: run.manifest_url,
      }))
      .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));

    const aggregated = {
      metroTrend: [],
      ixTrend: [],
      facilityTrend: [],
      networkTrend: [],
      networkIxTrend: [],
    };
    const usableSnapshots = [];
    const skippedSnapshots = [];

    for (const run of completeRuns) {
      const manifest = await fetchJson(run.manifestUrl);
      const missingFiles = getMissingSnapshotFiles(manifest);
      if (missingFiles.length > 0) {
        skippedSnapshots.push({
          snapshotDate: run.snapshotDate,
          reason: `Missing stored ${missingFiles.join(", ")} data`,
        });
        continue;
      }

      const [ixRows, facRows, netixlanRows, netfacRows, netRows] = await Promise.all([
        fetchJsonlGzip(requireFileUrl(manifest, "ix")),
        fetchJsonlGzip(requireFileUrl(manifest, "fac")),
        fetchJsonlGzip(requireFileUrl(manifest, "netixlan")),
        fetchJsonlGzip(requireFileUrl(manifest, "netfac")),
        fetchJsonlGzip(requireFileUrl(manifest, "net")),
      ]);

      const trends = buildSnapshotTrends({
        snapshotDate: run.snapshotDate,
        ixRows,
        facRows,
        netixlanRows,
        netfacRows,
        netRows,
      });

      aggregated.metroTrend.push(...trends.metroTrend);
      aggregated.ixTrend.push(...trends.ixTrend);
      aggregated.facilityTrend.push(...trends.facilityTrend);
      aggregated.networkTrend.push(...trends.networkTrend);
      aggregated.networkIxTrend.push(...trends.networkIxTrend);
      usableSnapshots.push(run.snapshotDate);
    }

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    res.status(200).json({
      region: "APAC",
      metros: APAC_METROS,
      snapshots: usableSnapshots,
      skippedSnapshots,
      ...aggregated,
    });
  } catch (err) {
    console.error("Failed to build snapshot trends", err);
    res.status(500).json({ error: err?.message || "Failed to build snapshot trends" });
  }
};
