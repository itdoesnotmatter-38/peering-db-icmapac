const zlib = require("zlib");

const { ensureSchema, getRunDetails } = require("../_lib/snapshotDb");

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

    if (!run.net_url || !run.org_url) {
      res.status(404).json({ error: "Snapshot source files are not available for this date" });
      return;
    }

    const [nets, orgs] = await Promise.all([
      fetchJsonlGzip(run.net_url),
      fetchJsonlGzip(run.org_url),
    ]);

    const orgLookup = new Map(
      orgs.map((org) => [
        org.id,
        {
          name: org.name || "",
          country: org.country || "",
          city: org.city || "",
        },
      ])
    );

    const rows = [
      [
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
      ],
      ...nets.map((net) => {
        const org = orgLookup.get(net.org_id) || {};
        return [
          snapshotDate,
          net.asn || "",
          net.id || "",
          net.name || "",
          net.info_type || "",
          net.status || "",
          net.website || "",
          net.org_id || "",
          org.name || "",
          org.country || "",
          org.city || "",
        ];
      }),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="peeringdb-snapshot-${snapshotDate}.csv"`
    );
    res.status(200).send(toCsv(rows));
  } catch (err) {
    console.error("Failed to generate snapshot CSV", err);
    res.status(500).json({ error: err?.message || "Failed to generate snapshot CSV" });
  }
};
