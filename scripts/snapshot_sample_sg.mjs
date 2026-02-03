#!/usr/bin/env node

import fs from 'fs';

const apiKey = process.env.PEERINGDB_API_KEY;
if (!apiKey) {
  console.error('Missing PEERINGDB_API_KEY');
  process.exit(1);
}

const OUTPUT_PATH = process.argv[2] || '/tmp/pdb_snapshot_sg_sample.json';
const COUNTRY = 'SG';
const CITY = 'Singapore';

const BASE = 'https://www.peeringdb.com/api';
const LIMIT = 250;

const buildUrl = (obj, params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    search.append(k, String(v));
  });
  return `${BASE}/${obj}?${search.toString()}`;
};

async function fetchPage(obj, params) {
  const url = buildUrl(obj, params);
  const resp = await fetch(url, {
    headers: { Authorization: `Api-Key ${apiKey}` },
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = json?.error || json?.message || `HTTP ${resp.status}`;
    throw new Error(`${obj} fetch failed: ${msg}`);
  }
  if (!json || !Array.isArray(json.data)) {
    throw new Error(`${obj} invalid response`);
  }
  return json.data;
}

async function fetchAll(obj, params = {}) {
  let skip = 0;
  let all = [];
  while (true) {
    const data = await fetchPage(obj, { ...params, limit: LIMIT, skip });
    all = all.concat(data);
    if (data.length < LIMIT) break;
    skip += LIMIT;
  }
  return all;
}

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

(async () => {
  const facs = await fetchAll('fac', { country: COUNTRY });
  const facIds = facs.map((f) => f.id).filter((id) => typeof id === 'number');

  const netfacRows = [];
  for (const ch of chunk(facIds, 20)) {
    const data = await fetchAll('netfac', { fac_id__in: ch.join(',') });
    netfacRows.push(...data);
  }

  const netIds = Array.from(new Set(netfacRows.map((r) => r.net_id).filter(Boolean)));
  const sampleNetIds = netIds.slice(0, 12);

  const nets = [];
  for (const ch of chunk(sampleNetIds, 50)) {
    const data = await fetchAll('net', { id__in: ch.join(',') });
    nets.push(...data);
  }

  const orgIds = Array.from(new Set(nets.map((n) => n.org_id).filter(Boolean)));
  const orgs = [];
  for (const ch of chunk(orgIds, 50)) {
    const data = await fetchAll('org', { id__in: ch.join(',') });
    orgs.push(...data);
  }
  const orgById = new Map(orgs.map((o) => [o.id, o]));

  const facByNetId = new Map();
  netfacRows.forEach((row) => {
    if (!facByNetId.has(row.net_id)) facByNetId.set(row.net_id, new Set());
    facByNetId.get(row.net_id).add(row.fac_id);
  });

  const sample = nets.map((net) => {
    const org = orgById.get(net.org_id) || {};
    return {
      net_id: net.id,
      asn: net.asn,
      network_name: net.name,
      network_type: net.info_type,
      org_id: net.org_id,
      org_name: org.name || null,
      org_country: org.country || null,
      org_city: org.city || null,
      sg_facility_count: facByNetId.get(net.id)?.size || 0,
    };
  });

  const output = {
    generated_at: new Date().toISOString(),
    source: 'PeeringDB API (direct)',
    country: COUNTRY,
    city: CITY,
    sample_size: sample.length,
    sample,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Wrote ${OUTPUT_PATH}`);
})();
