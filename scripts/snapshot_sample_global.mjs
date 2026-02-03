#!/usr/bin/env node

import fs from 'fs';

const apiKey = process.env.PEERINGDB_API_KEY;
if (!apiKey) {
  console.error('Missing PEERINGDB_API_KEY');
  process.exit(1);
}

const OUTPUT_PATH = process.argv[2] || '/tmp/pdb_snapshot_global_sample.json';
const SAMPLE_LIMIT = Number.parseInt(process.argv[3] || '50', 10);
const BASE = 'https://www.peeringdb.com/api';

const buildUrl = (obj, params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    search.append(k, String(v));
  });
  return `${BASE}/${obj}?${search.toString()}`;
};

const fetchJson = async (url) => {
  const resp = await fetch(url, {
    headers: { Authorization: `Api-Key ${apiKey}` },
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = json?.error || json?.message || `HTTP ${resp.status}`;
    throw new Error(`${msg} (${url})`);
  }
  if (!json || !Array.isArray(json.data)) {
    throw new Error(`Invalid response for ${url}`);
  }
  return json.data;
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

(async () => {
  const nets = await fetchJson(buildUrl('net', { limit: SAMPLE_LIMIT, skip: 0 }));
  const orgIds = Array.from(new Set(nets.map((n) => n.org_id).filter(Boolean)));

  const orgs = [];
  for (const ch of chunk(orgIds, 50)) {
    const data = await fetchJson(buildUrl('org', { id__in: ch.join(',') }));
    orgs.push(...data);
  }
  const orgById = new Map(orgs.map((o) => [o.id, o]));

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
    };
  });

  const output = {
    generated_at: new Date().toISOString(),
    source: 'PeeringDB API (direct)',
    sample_size: sample.length,
    sample,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Wrote ${OUTPUT_PATH}`);
})();
