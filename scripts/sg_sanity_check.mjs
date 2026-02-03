#!/usr/bin/env node

const METROS = {
  Singapore: { country: "SG", city: "Singapore", facCountryOnly: true },
  Jakarta: { country: "ID", city: "Jakarta", facCountryOnly: false },
  "Kuala Lumpur": { country: "MY", city: "Kuala Lumpur", facCountryOnly: false },
  Melbourne: { country: "AU", city: "Melbourne", facCountryOnly: false },
  Sydney: { country: "AU", city: "Sydney", facCountryOnly: false },
  Mumbai: { country: "IN", city: "Mumbai", facCountryOnly: false },
  "Hong Kong": { country: "HK", city: "Hong Kong", facCountryOnly: true },
  Chennai: { country: "IN", city: "Chennai", facCountryOnly: false },
  Seoul: { country: "KR", city: "Seoul", facCountryOnly: false },
  Tokyo: { country: "JP", city: "Tokyo", facCountryOnly: false },
  Osaka: { country: "JP", city: "Osaka", facCountryOnly: false },
  Perth: { country: "AU", city: "Perth", facCountryOnly: false },
};

const args = process.argv.slice(2);
const baseUrl = args[0]?.startsWith("http") ? args[0] : "http://localhost:3001";
const metroName = args[0]?.startsWith("http") ? args[1] : args[0];
const metro = metroName ? METROS[metroName] : METROS.Singapore;

if (!metro) {
  console.error("Unknown metro. Use one of:");
  console.error(Object.keys(METROS).join(", "));
  process.exit(1);
}

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

const buildUrl = (obj, params = {}) => {
  const search = new URLSearchParams();
  search.set("obj", obj);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => search.append(key, String(entry)));
      return;
    }
    search.set(key, String(value));
  });
  return `${baseUrl}/api/peeringdb?${search.toString()}`;
};

const fetchJson = async (url) => {
  const resp = await fetch(url);
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = json?.error || json?.message || `HTTP ${resp.status}`;
    throw new Error(`${msg} (${url})`);
  }
  if (!json || !Array.isArray(json.data)) {
    throw new Error(`Invalid response for ${url}`);
  }
  return {
    data: json.data,
    headers: {
      rows: resp.headers.get("x-peeringdb-rows"),
      pages: resp.headers.get("x-peeringdb-pages"),
      pageSize: resp.headers.get("x-peeringdb-page-size"),
    },
  };
};

const fetchAllByChunks = async (obj, key, ids, label) => {
  const chunks = chunk(ids, 20);
  let rows = [];
  let firstHeaders = null;

  for (const ch of chunks) {
    const params = { [key]: ch.join(","), all: 1 };
    const result = await fetchJson(buildUrl(obj, params));
    if (!firstHeaders) {
      firstHeaders = result.headers;
    }
    rows = rows.concat(result.data);
  }

  return { rows, headers: firstHeaders, label };
};

const main = async () => {
  console.log(`Using base URL: ${baseUrl}`);
  console.log(`Metro: ${metroName || "Singapore"} (${metro.country} / ${metro.city})`);

  const ixResult = await fetchJson(
    buildUrl("ix", { country: metro.country, city: metro.city })
  );

  const facParams = metro.facCountryOnly
    ? { country: metro.country }
    : { country: metro.country, city: metro.city };
  const facResult = await fetchJson(buildUrl("fac", facParams));

  const ixIds = ixResult.data.map((ix) => ix.id).filter((id) => typeof id === "number");
  const facIds = facResult.data.map((fac) => fac.id).filter((id) => typeof id === "number");

  console.log(`IX count (city): ${ixIds.length}`);
  console.log(`Facility count (${metro.facCountryOnly ? "country" : "city"}): ${facIds.length}`);

  const netixlan = await fetchAllByChunks("netixlan", "ix_id__in", ixIds, "netixlan");
  const netfac = await fetchAllByChunks("netfac", "fac_id__in", facIds, "netfac");

  const netixlanSet = new Set(netixlan.rows.map((row) => row.net_id).filter(Boolean));
  const netfacSet = new Set(netfac.rows.map((row) => row.net_id).filter(Boolean));

  const facilityOnly = Array.from(netfacSet).filter((id) => !netixlanSet.has(id));

  console.log(`netixlan rows: ${netixlan.rows.length}`);
  console.log(`netfac rows: ${netfac.rows.length}`);
  console.log(`netixlan unique nets: ${netixlanSet.size}`);
  console.log(`netfac unique nets: ${netfacSet.size}`);
  console.log(`Facility-only networks: ${facilityOnly.length}`);

  if (netixlan.headers?.rows || netfac.headers?.rows) {
    console.log("\nHeader sample (first chunk):");
    console.log(`netixlan headers: rows=${netixlan.headers?.rows} pages=${netixlan.headers?.pages} pageSize=${netixlan.headers?.pageSize}`);
    console.log(`netfac headers: rows=${netfac.headers?.rows} pages=${netfac.headers?.pages} pageSize=${netfac.headers?.pageSize}`);
  }

  if (facilityOnly.length > 0) {
    console.log("\nSample facility-only net IDs:");
    console.log(facilityOnly.slice(0, 20).join(", "));
  }
};

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
