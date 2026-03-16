const { fetchAllPages } = require("../_lib/peeringdb");

const MAX_NET_IDS_PER_CHUNK = 25;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
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

const normalizeCountry = (value) => String(value || "").trim().toUpperCase();

const fetchRows = async (obj, params, apiKey) => {
  const rows = [];
  await fetchAllPages({
    obj,
    params,
    apiKey,
    pageDelayMs: 150,
    onPage: async (pageRows) => {
      rows.push(...pageRows);
    },
  });
  return rows;
};

const buildNetLookup = async (netIds, apiKey) => {
  const netLookup = new Map();
  for (const idChunk of chunk(netIds, MAX_NET_IDS_PER_CHUNK)) {
    const nets = await fetchRows("net", { id__in: idChunk.join(",") }, apiKey);
    nets.forEach((net) => {
      netLookup.set(net.id, net);
    });
  }
  return netLookup;
};

const buildIxCsv = async (country, apiKey) => {
  const ixRows = await fetchRows("ix", { country }, apiKey);
  const ixLookup = new Map(ixRows.map((ix) => [ix.id, ix]));
  const ixIds = ixRows.map((ix) => ix.id).filter((id) => typeof id === "number");

  if (ixIds.length === 0) {
    return {
      filename: `peeringdb-ix-view-${country}.csv`,
      csv: toCsv([["country", "message"], [country, "No IX records found"]]),
    };
  }

  const netixlanRows = [];
  for (const ixIdChunk of chunk(ixIds, 10)) {
    const rows = await fetchRows("netixlan", { ix_id__in: ixIdChunk.join(",") }, apiKey);
    netixlanRows.push(...rows);
  }

  const netIds = Array.from(new Set(netixlanRows.map((row) => row.net_id).filter((id) => typeof id === "number")));
  const netLookup = await buildNetLookup(netIds, apiKey);

  const rows = [
    [
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
    ...netixlanRows.map((row) => {
      const ix = ixLookup.get(row.ix_id) || {};
      const net = netLookup.get(row.net_id) || {};
      return [
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

  return {
    filename: `peeringdb-ix-view-${country}.csv`,
    csv: toCsv(rows),
  };
};

const buildFacilityCsv = async (country, apiKey) => {
  const facRows = await fetchRows("fac", { country }, apiKey);
  const facLookup = new Map(facRows.map((fac) => [fac.id, fac]));
  const facIds = facRows.map((fac) => fac.id).filter((id) => typeof id === "number");

  if (facIds.length === 0) {
    return {
      filename: `peeringdb-facility-view-${country}.csv`,
      csv: toCsv([["country", "message"], [country, "No facility records found"]]),
    };
  }

  const netfacRows = [];
  for (const facIdChunk of chunk(facIds, 10)) {
    const rows = await fetchRows("netfac", { fac_id__in: facIdChunk.join(",") }, apiKey);
    netfacRows.push(...rows);
  }

  const netIds = Array.from(new Set(netfacRows.map((row) => row.net_id).filter((id) => typeof id === "number")));
  const netLookup = await buildNetLookup(netIds, apiKey);

  const rows = [
    [
      "country",
      "facility_id",
      "facility_name",
      "facility_city",
      "network_id",
      "asn",
      "network_name",
      "network_type",
    ],
    ...netfacRows.map((row) => {
      const fac = facLookup.get(row.fac_id) || {};
      const net = netLookup.get(row.net_id) || {};
      return [
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

  return {
    filename: `peeringdb-facility-view-${country}.csv`,
    csv: toCsv(rows),
  };
};

module.exports = async (req, res) => {
  const country = normalizeCountry(req.query?.country);
  const view = String(req.query?.view || "").trim().toLowerCase();
  const apiKey = process.env.PEERINGDB_API_KEY;

  if (!country || country.length !== 2) {
    res.status(400).json({ error: "Missing or invalid country code (expected ISO alpha-2)" });
    return;
  }

  if (view !== "ix" && view !== "facility") {
    res.status(400).json({ error: "Missing or invalid view (expected ix or facility)" });
    return;
  }

  try {
    const result =
      view === "ix" ? await buildIxCsv(country, apiKey) : await buildFacilityCsv(country, apiKey);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.status(200).send(result.csv);
  } catch (err) {
    console.error("Country CSV export failed", err);
    res.status(500).json({ error: err?.message || "Country CSV export failed" });
  }
};
