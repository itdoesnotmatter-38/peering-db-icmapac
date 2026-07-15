import { withApiRoot } from "../apiBase";

/* ============================================================
   Snapshot data layer for the redesigned views.
   One fetch of /api/snapshots/trends per session (module-level
   cache), then pure client-side aggregation. All numbers derive
   from stored monthly snapshots — no live PeeringDB calls.
   ============================================================ */

export interface MetroTrendRow {
  snapshotDate: string;
  metro: string;
  country: string;
  city: string;
  capacityMbps: number | null;
  networkCount: number | null;
  ixCount: number | null;
  facilityCount: number | null;
  facilityPresenceCount: number | null;
}

export interface IxTrendRow {
  snapshotDate: string;
  metro: string;
  ixId: number;
  ixName: string;
  capacityMbps: number | null;
  networkCount: number | null;
}

export interface FacilityTrendRow {
  snapshotDate: string;
  metro: string;
  facilityId: number;
  facilityName: string;
  facilityOrgName: string | null;
  networkCount: number | null;
}

export interface NetworkTrendRow {
  snapshotDate: string;
  metro: string;
  networkId: number;
  asn: number;
  networkName: string;
  networkType: string | null;
  capacityMbps: number | null;
  ixCount: number | null;
  facilityCount: number | null;
  presenceType: string | null;
}

export interface NetworkIxTrendRow {
  snapshotDate: string;
  metro: string;
  networkId: number;
  asn: number;
  networkName: string;
  ixId: number;
  ixName: string;
  capacityMbps: number | null;
}

export interface TrendsResponse {
  region: string;
  metros: Array<{ key: string; city: string; country: string }>;
  snapshots: string[];
  skippedSnapshots: Array<{ snapshotDate: string; reason: string }>;
  metroTrend: MetroTrendRow[];
  ixTrend: IxTrendRow[];
  facilityTrend: FacilityTrendRow[];
  networkTrend: NetworkTrendRow[];
  networkIxTrend: NetworkIxTrendRow[];
}

/* ---------------- fetch + module cache ---------------- */

let trendsPromise: Promise<TrendsResponse> | null = null;

export function loadTrends(): Promise<TrendsResponse> {
  if (!trendsPromise) {
    trendsPromise = fetch(withApiRoot("/api/snapshots/trends"))
      .then(async (res) => {
        if (!res.ok) throw new Error(`Snapshot API error: HTTP ${res.status}`);
        return (await res.json()) as TrendsResponse;
      })
      .catch((err) => {
        trendsPromise = null; // allow retry
        throw err;
      });
  }
  return trendsPromise;
}

/* ---------------- metro scope ---------------- */

/** Airport-style short codes for URL state and compact labels. */
export const METRO_CODES: Record<string, string> = {
  Singapore: "SIN",
  Jakarta: "JKT",
  "Kuala Lumpur": "KUL",
  Melbourne: "MEL",
  Sydney: "SYD",
  Mumbai: "BOM",
  "Hong Kong": "HKG",
  Bangkok: "BKK",
  Manila: "MNL",
  Chennai: "MAA",
  Seoul: "SEL",
  Tokyo: "TYO",
  Osaka: "OSA",
  Perth: "PER",
};
const CODE_TO_METRO: Record<string, string> = Object.fromEntries(
  Object.entries(METRO_CODES).map(([k, v]) => [v, k])
);

export function scopeToParam(metros: string[] | null): string {
  if (!metros || !metros.length) return "";
  return metros.map((m) => METRO_CODES[m] || m).join(",");
}

export function paramToScope(param: string | null): string[] | null {
  if (!param) return null;
  const metros = param
    .split(",")
    .map((c) => CODE_TO_METRO[c.trim().toUpperCase()])
    .filter(Boolean);
  return metros.length ? metros : null;
}

export function scopeLabel(metros: string[] | null): string {
  if (!metros || !metros.length) return "All APAC";
  if (metros.length <= 3) return metros.map((m) => METRO_CODES[m] || m).join(" + ");
  return `${metros.length} metros`;
}

/** Narrow every trend table to the selected metros. */
export function filterByMetros(d: TrendsResponse, metros: string[] | null): TrendsResponse {
  if (!metros || !metros.length) return d;
  const set = new Set(metros);
  const keep = <T extends { metro: string }>(rows: T[]) => rows.filter((r) => set.has(r.metro));
  return {
    ...d,
    metros: d.metros.filter((m) => set.has(m.key)),
    metroTrend: keep(d.metroTrend),
    ixTrend: keep(d.ixTrend),
    facilityTrend: keep(d.facilityTrend),
    networkTrend: keep(d.networkTrend),
    networkIxTrend: keep(d.networkIxTrend),
  };
}

/* ---------------- shared helpers ---------------- */

export const isEquinixIx = (name: string | null | undefined) =>
  String(name || "").toLowerCase().includes("equinix");

export const isEquinixFacilityOrg = (org: string | null | undefined) =>
  String(org || "").toLowerCase().startsWith("equinix");

const mbpsToT = (v: number | null | undefined) => (v || 0) / 1_000_000;
const mbpsToG = (v: number | null | undefined) => (v || 0) / 1_000;

export const fmtT = (t: number, dp = 1) => `${t.toFixed(dp)}`;
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[(m || 1) - 1]} ${y}`;
};
export const fmtMonth = (iso: string) => {
  const m = Number(iso.split("-")[1] || 1);
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
};
/** "31 May" — day+month, disambiguates multiple snapshots in one month. */
export const fmtDayMonth = (iso: string) => {
  const parts = iso.split("-").map(Number);
  return `${parts[2]} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][(parts[1] || 1) - 1]}`;
};

/* ---------------- derived model ---------------- */

export interface MetroStat {
  metro: string;
  country: string;
  capT: number;
  nets: number;
  ix: number;
  fac: number;
  pres: number;
  dCapT: number;
  dNets: number;
}

export interface NetworkMover {
  asn: number;
  name: string;
  dCapT: number;
}

export interface ShareStat {
  metro: string;
  eqxT: number;
  totT: number;
  pct: number;
}

export interface OperatorShare {
  org: string;
  presences: number;
  pct: number;
  isEquinix: boolean;
}

export interface MovementEntry {
  asn: number;
  name: string;
  type: string;
  capT: number;
}

export interface UpgradeEntry {
  asn: number;
  name: string;
  ixId: number;
  ixName: string;
  metro: string;
  fromG: number;
  toG: number;
  deltaG: number;
  isEquinix: boolean;
}

export interface Waterfall {
  entrantsT: number;
  entrantsN: number;
  upgradesT: number;
  upgradesN: number;
  downgradesT: number;
  downgradesN: number;
  departuresT: number;
  departuresN: number;
  netT: number;
}

export interface InsightCard {
  cat: "shift" | "eqx" | "gapc" | "move" | "watch";
  catLabel: string;
  title: string;
  body: string;
  bars?: Array<{ label: string; value: number; max: number; color: string; text: string }>;
  list?: Array<{ name: string; sub?: string; amount: string; neg?: boolean }>;
}

export interface WatchRow {
  asn: number;
  name: string;
  metros: number;
  capT: number;
  dCapT: number;
  found: boolean;
}

export interface Derived {
  snapshots: string[];
  latest: string;
  prev: string;
  totals: { capT: number; nets: number; ix: number; fac: number; pres: number };
  deltas: { capT: number; nets: number; ix: number; fac: number; pres: number };
  capSeries: number[];
  netSeries: number[];
  metros: MetroStat[];
  metroCapMovers: Array<{ metro: string; dCapT: number }>;
  networkMovers: NetworkMover[];
  share: {
    byMetro: ShareStat[];
    apacPct: number;
    apacSeries: number[];
    metroSeries: Array<{ metro: string; series: number[]; pct: number; dPP: number }>;
    dcPct: number;
    dcRankNote: string;
    operators: OperatorShare[];
  };
  insights: InsightCard[];
  upgrades: UpgradeEntry[];
}

const uniqSorted = (arr: string[]) => Array.from(new Set(arr)).sort();

function metroRows(d: TrendsResponse, snap: string): MetroTrendRow[] {
  return d.metroTrend.filter((r) => r.snapshotDate === snap);
}

function networksIn(d: TrendsResponse, snap: string, metro: string): Map<number, NetworkTrendRow> {
  const m = new Map<number, NetworkTrendRow>();
  for (const r of d.networkTrend) {
    if (r.snapshotDate === snap && r.metro === metro) m.set(r.asn, r);
  }
  return m;
}

function apacNetworkCap(d: TrendsResponse, snap: string): Map<number, { cap: number; name: string }> {
  const m = new Map<number, { cap: number; name: string }>();
  for (const r of d.networkTrend) {
    if (r.snapshotDate !== snap) continue;
    const e = m.get(r.asn) || { cap: 0, name: r.networkName };
    e.cap += r.capacityMbps || 0;
    e.name = r.networkName;
    m.set(r.asn, e);
  }
  return m;
}

export function derive(d: TrendsResponse): Derived {
  const snapshots = uniqSorted(d.snapshots);
  const latest = snapshots[snapshots.length - 1];
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : latest;

  /* ---- metro stats + totals ---- */
  const cur = metroRows(d, latest);
  const before = new Map(metroRows(d, prev).map((r) => [r.metro, r]));
  const metros: MetroStat[] = cur
    .map((r) => {
      const p = before.get(r.metro);
      return {
        metro: r.metro,
        country: r.country,
        capT: mbpsToT(r.capacityMbps),
        nets: r.networkCount || 0,
        ix: r.ixCount || 0,
        fac: r.facilityCount || 0,
        pres: r.facilityPresenceCount || 0,
        dCapT: mbpsToT(r.capacityMbps) - mbpsToT(p?.capacityMbps),
        dNets: (r.networkCount || 0) - (p?.networkCount || 0),
      };
    })
    .sort((a, b) => b.capT - a.capT);

  const sum = (f: (m: MetroStat) => number) => metros.reduce((a, m) => a + f(m), 0);
  const uniqNets = (snap: string) => {
    const s = new Set<number>();
    for (const r of d.networkTrend) if (r.snapshotDate === snap) s.add(r.asn);
    return s.size;
  };
  const uniqIx = (snap: string) => {
    const s = new Set<number>();
    for (const r of d.ixTrend) if (r.snapshotDate === snap) s.add(r.ixId);
    return s.size;
  };
  const capFor = (snap: string) =>
    d.metroTrend.filter((r) => r.snapshotDate === snap).reduce((a, r) => a + mbpsToT(r.capacityMbps), 0);

  const prevRows = metroRows(d, prev);
  const totals = {
    capT: sum((m) => m.capT),
    nets: uniqNets(latest),
    ix: uniqIx(latest),
    fac: sum((m) => m.fac),
    pres: sum((m) => m.pres),
  };
  const deltas = {
    capT: totals.capT - prevRows.reduce((a, r) => a + mbpsToT(r.capacityMbps), 0),
    nets: totals.nets - uniqNets(prev),
    ix: totals.ix - uniqIx(prev),
    fac: totals.fac - prevRows.reduce((a, r) => a + (r.facilityCount || 0), 0),
    pres: totals.pres - prevRows.reduce((a, r) => a + (r.facilityPresenceCount || 0), 0),
  };
  const capSeries = snapshots.map(capFor);
  const netSeries = snapshots.map(uniqNets);

  /* ---- movers ---- */
  const metroCapMovers = metros
    .map((m) => ({ metro: m.metro, dCapT: m.dCapT }))
    .sort((a, b) => b.dCapT - a.dCapT)
    .slice(0, 5);

  const curNet = apacNetworkCap(d, latest);
  const prevNet = apacNetworkCap(d, prev);
  const networkMovers: NetworkMover[] = Array.from(curNet.entries())
    .map(([asn, e]) => ({ asn, name: e.name, dCapT: mbpsToT(e.cap) - mbpsToT(prevNet.get(asn)?.cap) }))
    .filter((m) => Math.abs(m.dCapT) >= 0.05)
    .sort((a, b) => Math.abs(b.dCapT) - Math.abs(a.dCapT))
    .slice(0, 5);

  /* ---- Equinix share ---- */
  const shareAt = (snap: string): Map<string, { eqx: number; tot: number }> => {
    const m = new Map<string, { eqx: number; tot: number }>();
    for (const r of d.ixTrend) {
      if (r.snapshotDate !== snap) continue;
      const e = m.get(r.metro) || { eqx: 0, tot: 0 };
      const c = mbpsToT(r.capacityMbps);
      e.tot += c;
      if (isEquinixIx(r.ixName)) e.eqx += c;
      m.set(r.metro, e);
    }
    return m;
  };
  const latestShare = shareAt(latest);
  const byMetro: ShareStat[] = Array.from(latestShare.entries())
    .map(([metro, s]) => ({ metro, eqxT: s.eqx, totT: s.tot, pct: s.tot ? (s.eqx / s.tot) * 100 : 0 }))
    .filter((s) => s.eqxT > 0.01)
    .sort((a, b) => b.pct - a.pct);

  const apacSeries = snapshots.map((snap) => {
    const m = shareAt(snap);
    let e = 0;
    let t = 0;
    m.forEach((v) => {
      e += v.eqx;
      t += v.tot;
    });
    return t ? (e / t) * 100 : 0;
  });
  const apacPct = apacSeries[apacSeries.length - 1] || 0;

  const topShareMetros = byMetro.slice(0, 2).map((s) => s.metro);
  const metroSeries = topShareMetros.map((metro) => {
    const series = snapshots.map((snap) => {
      const v = shareAt(snap).get(metro);
      return v && v.tot ? (v.eqx / v.tot) * 100 : 0;
    });
    return { metro, series, pct: series[series.length - 1], dPP: series[series.length - 1] - series[0] };
  });

  /* ---- facility operator share ---- */
  const ops = new Map<string, number>();
  let presTotal = 0;
  for (const r of d.facilityTrend) {
    if (r.snapshotDate !== latest) continue;
    const org = r.facilityOrgName || "Unknown";
    const n = r.networkCount || 0;
    ops.set(org, (ops.get(org) || 0) + n);
    presTotal += n;
  }
  const operators: OperatorShare[] = Array.from(ops.entries())
    .map(([org, presences]) => ({
      org,
      presences,
      pct: presTotal ? (presences / presTotal) * 100 : 0,
      isEquinix: isEquinixFacilityOrg(org),
    }))
    .sort((a, b) => b.presences - a.presences)
    .slice(0, 8);
  const eqxOp = operators.find((o) => o.isEquinix);
  const nextOp = operators.find((o) => !o.isEquinix);
  const dcPct = eqxOp?.pct || 0;
  const dcRankNote =
    eqxOp && nextOp && operators[0].isEquinix
      ? `#1 operator · ${(eqxOp.presences / Math.max(nextOp.presences, 1)).toFixed(1)}× next`
      : "";

  /* ---- upgrade radar (region-wide, latest transition) ---- */
  const upgrades = upgradesFor(d, latest, prev);

  /* ---- computed insight cards ---- */
  const insights = buildInsights(d, {
    snapshots,
    latest,
    prev,
    metros,
    byMetro,
    apacSeries,
    networkMovers,
    upgrades,
  });

  return {
    snapshots,
    latest,
    prev,
    totals,
    deltas,
    capSeries,
    netSeries,
    metros,
    metroCapMovers,
    networkMovers,
    share: { byMetro, apacPct, apacSeries, metroSeries, dcPct, dcRankNote, operators },
    insights,
    upgrades,
  };
}

/* ---------------- insight card rules ---------------- */

function buildInsights(
  d: TrendsResponse,
  ctx: {
    snapshots: string[];
    latest: string;
    prev: string;
    metros: MetroStat[];
    byMetro: ShareStat[];
    apacSeries: number[];
    networkMovers: NetworkMover[];
    upgrades: UpgradeEntry[];
  }
): InsightCard[] {
  const cards: InsightCard[] = [];
  const { metros, latest } = ctx;

  /* Rule 1 — leader vs fastest-growing top-5 metro */
  if (metros.length >= 2) {
    const leader = metros[0];
    const chaser = [...metros.slice(0, 5)].sort((a, b) => b.dCapT - a.dCapT)[0];
    if (chaser.metro !== leader.metro && chaser.dCapT > leader.dCapT) {
      cards.push({
        cat: "shift",
        catLabel: "Market shift",
        title: `${chaser.metro} is closing the gap on ${leader.metro}`,
        body: `${leader.metro} leads at ${leader.capT.toFixed(1)} Tbps, but ${chaser.metro} added ${chaser.dCapT.toFixed(1)} Tbps this month vs ${leader.dCapT.toFixed(1)} (networks: ${chaser.dNets >= 0 ? "+" : ""}${chaser.dNets} vs ${leader.dNets >= 0 ? "+" : ""}${leader.dNets}).`,
        bars: [
          { label: leader.metro, value: leader.capT, max: leader.capT, color: "var(--accent)", text: `${leader.capT.toFixed(1)} T` },
          { label: chaser.metro, value: chaser.capT, max: leader.capT, color: "var(--accent)", text: `${chaser.capT.toFixed(1)} T` },
        ],
      });
    }
  }

  /* Rule 2 — largest exchange in the region */
  const ixAgg = new Map<string, { cap: number; nets: number; metro: string; name: string }>();
  for (const r of d.ixTrend) {
    if (r.snapshotDate !== latest) continue;
    const key = `${r.ixName}|${r.metro}`;
    const e = ixAgg.get(key) || { cap: 0, nets: 0, metro: r.metro, name: r.ixName };
    e.cap += (r.capacityMbps || 0) / 1e6;
    e.nets = Math.max(e.nets, r.networkCount || 0);
    ixAgg.set(key, e);
  }
  const topIx = Array.from(ixAgg.values()).sort((a, b) => b.cap - a.cap);
  if (topIx.length >= 3) {
    const t0 = topIx[0];
    const isEqx = isEquinixIx(t0.name);
    cards.push({
      cat: isEqx ? "eqx" : "shift",
      catLabel: isEqx ? "Equinix" : "Market shift",
      title: `${t0.name} is APAC's largest exchange`,
      body: `${t0.cap.toFixed(1)} Tbps deployed across ${t0.nets} networks — ${(t0.cap / topIx[1].cap).toFixed(1)}× the next-largest exchange in the region.`,
      bars: topIx.slice(0, 3).map((x, i) => ({
        label: x.name.length > 16 ? `${x.name.slice(0, 15)}…` : x.name,
        value: x.cap,
        max: t0.cap,
        color: i === 0 && isEqx ? "var(--equinix)" : "var(--border-strong)",
        text: `${x.cap.toFixed(1)} T`,
      })),
    });
  }

  /* Rule 3 — metro where capacity leader ≠ network-count leader */
  const perMetroIx = new Map<string, Array<{ name: string; cap: number; nets: number }>>();
  ixAgg.forEach((v) => {
    const list = perMetroIx.get(v.metro) || [];
    list.push({ name: v.name, cap: v.cap, nets: v.nets });
    perMetroIx.set(v.metro, list);
  });
  perMetroIx.forEach((list, metro) => {
    if (cards.some((c) => c.cat === "eqx" && c.title.includes(metro))) return;
    const byCap = [...list].sort((a, b) => b.cap - a.cap);
    const byNets = [...list].sort((a, b) => b.nets - a.nets);
    const capLead = byCap[0];
    const netLead = byNets[0];
    if (
      cards.length < 6 &&
      capLead &&
      netLead &&
      capLead.name !== netLead.name &&
      (isEquinixIx(capLead.name) || isEquinixIx(netLead.name)) &&
      capLead.cap > 5 &&
      !cards.some((c) => c.title.startsWith(`${metro}:`))
    ) {
      cards.push({
        cat: "eqx",
        catLabel: "Equinix",
        title: `${metro}: ${isEquinixIx(capLead.name) ? "Equinix leads capacity" : `${capLead.name} leads capacity`}, ${netLead.name} leads count`,
        body: `${capLead.name} carries ${capLead.cap.toFixed(1)} Tbps from ${capLead.nets} networks; ${netLead.name} carries ${byCap.find((x) => x.name === netLead.name)?.cap.toFixed(1)} Tbps but reaches ${netLead.nets} networks.`,
        bars: [
          { label: capLead.name.length > 14 ? `${capLead.name.slice(0, 13)}…` : capLead.name, value: capLead.cap, max: capLead.cap, color: isEquinixIx(capLead.name) ? "var(--equinix)" : "var(--border-strong)", text: `${capLead.cap.toFixed(1)} T` },
          { label: netLead.name.length > 14 ? `${netLead.name.slice(0, 13)}…` : netLead.name, value: byCap.find((x) => x.name === netLead.name)?.cap || 0, max: capLead.cap, color: isEquinixIx(netLead.name) ? "var(--equinix)" : "var(--border-strong)", text: `${(byCap.find((x) => x.name === netLead.name)?.cap || 0).toFixed(1)} T` },
        ],
      });
    }
  });

  /* Rule 4 — expansion gaps between the two biggest Equinix-share metros */
  const pair = ctx.byMetro.slice(0, 2).map((s) => s.metro);
  if (pair.length === 2) {
    const [a, b] = pair;
    const inA = networksIn(d, latest, a);
    const inB = networksIn(d, latest, b);
    const gaps = Array.from(inA.values())
      .filter((r) => !inB.has(r.asn) && (r.capacityMbps || 0) >= 1_000_000)
      .sort((x, y) => (y.capacityMbps || 0) - (x.capacityMbps || 0))
      .slice(0, 3);
    if (gaps.length) {
      cards.push({
        cat: "gapc",
        catLabel: "Expansion gap",
        title: `${gaps.length} ${a} heavyweight${gaps.length > 1 ? "s" : ""} still absent from ${b}`,
        body: `Each runs 1+ Tbps in ${a} with zero ${b} presence — the shortlist for an expansion conversation.`,
        list: gaps.map((g) => ({
          name: g.networkName,
          sub: g.networkName.includes(`AS${g.asn}`) ? undefined : `AS${g.asn}`,
          amount: `${((g.capacityMbps || 0) / 1e6).toFixed(1)} T`,
        })),
      });
    }
  }

  /* Rule 5 — biggest network mover + concentration */
  const mover = ctx.networkMovers[0];
  if (mover && mover.dCapT > 0) {
    const rows = d.networkIxTrend.filter((r) => r.snapshotDate === latest && r.asn === mover.asn);
    const total = rows.reduce((s, r) => s + (r.capacityMbps || 0), 0) / 1e6;
    const byIx = new Map<string, number>();
    rows.forEach((r) => byIx.set(r.ixName, (byIx.get(r.ixName) || 0) + (r.capacityMbps || 0) / 1e6));
    const top = Array.from(byIx.entries()).sort((x, y) => y[1] - x[1])[0];
    if (top && total > 0) {
      const pct = Math.round((top[1] / total) * 100);
      cards.push({
        cat: "move",
        catLabel: "Network move",
        title: `${mover.name} made the month's biggest move`,
        body: `+${mover.dCapT.toFixed(1)} Tbps added across APAC. ${top[1].toFixed(1)} of its ${total.toFixed(1)} Tbps sits on ${top[0]} — a ${pct}% single-exchange share.`,
        bars: [
          { label: top[0].length > 14 ? `${top[0].slice(0, 13)}…` : top[0], value: top[1], max: total, color: isEquinixIx(top[0]) ? "var(--equinix)" : "var(--accent)", text: `${top[1].toFixed(1)} T` },
          { label: "Everything else", value: total - top[1], max: total, color: "var(--border-strong)", text: `${(total - top[1]).toFixed(1)} T` },
        ],
      });
    }
  }

  /* Rule 6 — shrinking metros */
  const shrinking = metros.filter((m) => m.dNets < 0).sort((a, b) => a.dNets - b.dNets);
  if (shrinking.length) {
    cards.push({
      cat: "watch",
      catLabel: "Watch",
      title: `${shrinking.length} metro${shrinking.length > 1 ? "s" : ""} lost networks in ${fmtMonth(latest)}`,
      body: `${shrinking.map((m) => m.metro).join(", ")} shrank while the rest of APAC grew. One month isn't a trend — the ${fmtMonth(latest) === "Dec" ? "next" : "next"} snapshot will tell.`,
      list: shrinking.slice(0, 4).map((m) => ({ name: m.metro, amount: `${m.dNets} nets`, neg: true })),
    });
  }

  return cards.slice(0, 6);
}

/* ---------------- upgrades (any transition) ---------------- */

export function upgradesFor(d: TrendsResponse, to: string, from: string): UpgradeEntry[] {
  const ixCapAt = (snap: string) => {
    const m = new Map<string, NetworkIxTrendRow>();
    for (const r of d.networkIxTrend) {
      if (r.snapshotDate === snap) m.set(`${r.asn}|${r.ixId}|${r.metro}`, r);
    }
    return m;
  };
  const curIx = ixCapAt(to);
  const prevIx = ixCapAt(from);
  const upgrades: UpgradeEntry[] = [];
  curIx.forEach((r, key) => {
    const p = prevIx.get(key);
    const delta = mbpsToG(r.capacityMbps) - mbpsToG(p?.capacityMbps);
    if (delta >= 100) {
      upgrades.push({
        asn: r.asn,
        name: r.networkName,
        ixId: r.ixId,
        ixName: r.ixName,
        metro: r.metro,
        fromG: mbpsToG(p?.capacityMbps),
        toG: mbpsToG(r.capacityMbps),
        deltaG: delta,
        isEquinix: isEquinixIx(r.ixName),
      });
    }
  });
  return upgrades.sort((a, b) => b.deltaG - a.deltaG);
}

/* ---------------- movement heatmap ---------------- */

export interface HeatTransition {
  from: string;
  to: string;
}

export interface HeatRow {
  metro: string;
  /** one cell per transition: capacity delta (Tbps) and network-count delta */
  cells: Array<{ dCapT: number; dNets: number }>;
}

export interface MovementHeat {
  transitions: HeatTransition[];
  rows: HeatRow[];
  maxAbsCapT: number;
  maxAbsNets: number;
}

/** Metros × snapshot-transitions grid of net change, for the Movement heatmap. */
export function movementHeatmap(fd: TrendsResponse): MovementHeat {
  const snapshots = uniqSorted(fd.snapshots);
  const transitions: HeatTransition[] = snapshots.slice(1).map((to, i) => ({ from: snapshots[i], to }));

  const at = (snap: string) => {
    const m = new Map<string, { capT: number; nets: number }>();
    for (const r of fd.metroTrend) {
      if (r.snapshotDate === snap) m.set(r.metro, { capT: mbpsToT(r.capacityMbps), nets: r.networkCount || 0 });
    }
    return m;
  };
  const bySnap = new Map(snapshots.map((s) => [s, at(s)]));

  const latest = bySnap.get(snapshots[snapshots.length - 1])!;
  const metros = Array.from(latest.entries())
    .sort((a, b) => b[1].capT - a[1].capT)
    .map(([m]) => m);

  let maxAbsCapT = 0.001;
  let maxAbsNets = 1;
  const rows: HeatRow[] = metros.map((metro) => ({
    metro,
    cells: transitions.map((t) => {
      const a = bySnap.get(t.from)?.get(metro);
      const b = bySnap.get(t.to)?.get(metro);
      const dCapT = (b?.capT || 0) - (a?.capT || 0);
      const dNets = (b?.nets || 0) - (a?.nets || 0);
      maxAbsCapT = Math.max(maxAbsCapT, Math.abs(dCapT));
      maxAbsNets = Math.max(maxAbsNets, Math.abs(dNets));
      return { dCapT, dNets };
    }),
  }));

  return { transitions, rows, maxAbsCapT, maxAbsNets };
}

/* ---------------- market changes (network × IX shift) ---------------- */

export type ShiftStatus = "up" | "down" | "added" | "removed" | "migration";

export interface ShiftCell {
  ixId: number;
  ixName: string;
  metro: string;
  isEquinix: boolean;
  fromG: number;
  toG: number;
  changeG: number;
}

export interface ShiftNetwork {
  key: string;
  networkId: number;
  asn: number;
  name: string;
  metro: string;
  status: ShiftStatus;
  totalChangeG: number;
  cells: ShiftCell[];
}

export interface ShiftColumn {
  ixId: number;
  ixName: string;
  metro: string;
  isEquinix: boolean;
  activityG: number;
}

export interface MarketChanges {
  networks: ShiftNetwork[];
  summary: {
    upgradedG: number;
    reducedG: number;
    netG: number;
    added: number;
    removed: number;
    migrations: number;
  };
}

/** Per-network, per-IX capacity change between two snapshots (scope-filtered).
    Everything is derived from netixlan ports so cells and row totals agree. */
export function marketChanges(fd: TrendsResponse, from: string, to: string): MarketChanges {
  // key by (networkId, metro): an IX belongs to a metro, so a network in two
  // metros is two rows — matching how the exchange dimension actually works.
  type Bucket = { asn: number; name: string; metro: string; cells: Map<number, ShiftCell> };
  const buckets = new Map<string, Bucket>();

  const touch = (r: NetworkIxTrendRow) => {
    const key = `${r.networkId}|${r.metro}`;
    let b = buckets.get(key);
    if (!b) {
      b = { asn: r.asn, name: r.networkName, metro: r.metro, cells: new Map() };
      buckets.set(key, b);
    }
    let c = b.cells.get(r.ixId);
    if (!c) {
      c = { ixId: r.ixId, ixName: r.ixName || `IX ${r.ixId}`, metro: r.metro, isEquinix: isEquinixIx(r.ixName), fromG: 0, toG: 0, changeG: 0 };
      b.cells.set(r.ixId, c);
    }
    return c;
  };

  for (const r of fd.networkIxTrend) {
    const g = (r.capacityMbps || 0) / 1000;
    if (r.snapshotDate === from) touch(r).fromG += g;
    else if (r.snapshotDate === to) touch(r).toG += g;
  }
  buckets.forEach((b) => b.cells.forEach((c) => (c.changeG = c.toG - c.fromG)));

  let upgradedG = 0;
  let reducedG = 0;
  let added = 0;
  let removed = 0;
  let migrations = 0;

  const networks: ShiftNetwork[] = [];
  buckets.forEach((b, key) => {
    const cells = Array.from(b.cells.values()).filter((c) => Math.abs(c.changeG) >= 1);
    if (!cells.length) return;
    const totalChangeG = cells.reduce((a, c) => a + c.changeG, 0);
    const gained = cells.some((c) => c.changeG > 0);
    const lost = cells.some((c) => c.changeG < 0);

    // capacity moved between exchanges but net ~flat = a migration
    let status: ShiftStatus;
    if (Math.abs(totalChangeG) < 1 && gained && lost) status = "migration";
    else if (totalChangeG > 0) status = "up";
    else status = "down";

    cells.forEach((c) => {
      if (c.changeG > 0) upgradedG += c.changeG;
      else reducedG += -c.changeG;
    });
    if (status === "migration") migrations += 1;

    networks.push({
      key,
      networkId: Number(key.split("|")[0]),
      asn: b.asn,
      name: b.name,
      metro: b.metro,
      status,
      totalChangeG,
      cells: cells.sort((a, c) => Math.abs(c.changeG) - Math.abs(a.changeG)),
    });
  });

  // decide added/removed by whole-network presence across the two snapshots
  const presence = presenceByNetworkMetro(fd, from, to);
  for (const n of networks) {
    const p = presence.get(n.key);
    if (p) {
      if (!p.from && p.to) {
        n.status = "added";
        added += 1;
      } else if (p.from && !p.to) {
        n.status = "removed";
        removed += 1;
      }
    }
  }

  networks.sort((a, b) => Math.abs(b.totalChangeG) - Math.abs(a.totalChangeG));
  return { networks, summary: { upgradedG, reducedG, netG: upgradedG - reducedG, added, removed, migrations } };
}

function presenceByNetworkMetro(fd: TrendsResponse, from: string, to: string) {
  const m = new Map<string, { from: boolean; to: boolean }>();
  for (const r of fd.networkTrend) {
    if (r.snapshotDate !== from && r.snapshotDate !== to) continue;
    const key = `${r.networkId}|${r.metro}`;
    const e = m.get(key) || { from: false, to: false };
    if (r.snapshotDate === from) e.from = true;
    if (r.snapshotDate === to) e.to = true;
    m.set(key, e);
  }
  return m;
}

/** Pick the IX columns to show: Equinix pinned first, then by total activity. */
export function shiftColumns(networks: ShiftNetwork[], limit = 10): ShiftColumn[] {
  const agg = new Map<number, ShiftColumn>();
  for (const n of networks) {
    for (const c of n.cells) {
      const e = agg.get(c.ixId) || { ixId: c.ixId, ixName: c.ixName, metro: c.metro, isEquinix: c.isEquinix, activityG: 0 };
      e.activityG += Math.abs(c.changeG);
      agg.set(c.ixId, e);
    }
  }
  return Array.from(agg.values())
    .sort((a, b) => {
      if (a.isEquinix !== b.isEquinix) return a.isEquinix ? -1 : 1;
      return b.activityG - a.activityG;
    })
    .slice(0, limit);
}

/* ---------------- movement (per metro) ---------------- */

export function movementFor(
  d: TrendsResponse,
  latest: string,
  prev: string,
  metro: string
): { entrants: MovementEntry[]; departures: MovementEntry[]; waterfall: Waterfall } {
  const cur = networksIn(d, latest, metro);
  const before = networksIn(d, prev, metro);

  const entrants: MovementEntry[] = [];
  const departures: MovementEntry[] = [];
  let entrantsT = 0;
  let upgradesT = 0;
  let upgradesN = 0;
  let downgradesT = 0;
  let downgradesN = 0;
  let departuresT = 0;

  cur.forEach((r, asn) => {
    const p = before.get(asn);
    const capT = mbpsToT(r.capacityMbps);
    if (!p) {
      entrants.push({ asn, name: r.networkName, type: r.networkType || "—", capT });
      entrantsT += capT;
    } else {
      const delta = capT - mbpsToT(p.capacityMbps);
      if (delta > 0.0005) {
        upgradesT += delta;
        upgradesN += 1;
      } else if (delta < -0.0005) {
        downgradesT += delta;
        downgradesN += 1;
      }
    }
  });
  before.forEach((r, asn) => {
    if (!cur.has(asn)) {
      const capT = mbpsToT(r.capacityMbps);
      departures.push({ asn, name: r.networkName, type: r.networkType || "—", capT });
      departuresT += capT;
    }
  });

  entrants.sort((a, b) => b.capT - a.capT);
  departures.sort((a, b) => b.capT - a.capT);

  return {
    entrants,
    departures,
    waterfall: {
      entrantsT,
      entrantsN: entrants.length,
      upgradesT,
      upgradesN,
      downgradesT,
      downgradesN,
      departuresT,
      departuresN: departures.length,
      netT: entrantsT + upgradesT + downgradesT - departuresT,
    },
  };
}

/* ---------------- exchanges ---------------- */

export interface ExchangeRank {
  ixId: number;
  name: string;
  metro: string;
  capT: number;
  nets: number;
  isEquinix: boolean;
  pctOfScope: number;
}

/** Exchanges in the (already scope-filtered) dataset, ranked by capacity. */
export function exchangesRanking(fd: TrendsResponse, latest: string): ExchangeRank[] {
  const agg = new Map<number, ExchangeRank>();
  let total = 0;
  for (const r of fd.ixTrend) {
    if (r.snapshotDate !== latest) continue;
    const capT = (r.capacityMbps || 0) / 1e6;
    total += capT;
    const e = agg.get(r.ixId) || {
      ixId: r.ixId,
      name: r.ixName,
      metro: r.metro,
      capT: 0,
      nets: 0,
      isEquinix: isEquinixIx(r.ixName),
      pctOfScope: 0,
    };
    e.capT += capT;
    e.nets = Math.max(e.nets, r.networkCount || 0);
    agg.set(r.ixId, e);
  }
  return Array.from(agg.values())
    .map((e) => ({ ...e, pctOfScope: total ? (e.capT / total) * 100 : 0 }))
    .sort((a, b) => b.capT - a.capT);
}

export interface FacilityRank {
  facilityId: number;
  name: string;
  org: string;
  metro: string;
  networkCount: number;
  isEquinix: boolean;
}

export interface FacilityMetaEntry {
  name: string;
  org: string;
  metro: string;
  isEquinix: boolean;
}

/** facId -> facility metadata (name, operator, metro) from the latest snapshot,
    for enriching live netfac rows on the network profile. UNFILTERED. */
export function facilityMeta(d: TrendsResponse): Map<number, FacilityMetaEntry> {
  const latest = uniqSorted(d.snapshots).slice(-1)[0];
  const m = new Map<number, FacilityMetaEntry>();
  for (const r of d.facilityTrend) {
    if (r.snapshotDate === latest && !m.has(r.facilityId)) {
      m.set(r.facilityId, {
        name: r.facilityName,
        org: r.facilityOrgName || "—",
        metro: r.metro,
        isEquinix: isEquinixFacilityOrg(r.facilityOrgName),
      });
    }
  }
  return m;
}

/** Facilities (data centres) in the scope-filtered dataset, by network presence. */
export function facilitiesRanking(fd: TrendsResponse, latest: string): FacilityRank[] {
  return fd.facilityTrend
    .filter((r) => r.snapshotDate === latest)
    .map((r) => ({
      facilityId: r.facilityId,
      name: r.facilityName,
      org: r.facilityOrgName || "—",
      metro: r.metro,
      networkCount: r.networkCount || 0,
      isEquinix: isEquinixFacilityOrg(r.facilityOrgName),
    }))
    .sort((a, b) => b.networkCount - a.networkCount);
}

export interface NetworkDirEntry {
  asn: number;
  name: string;
  type: string;
  capT: number;
  metros: number;
  ports: number;
}

/** All networks in the scope-filtered dataset, aggregated for the directory. */
export function networksDirectory(fd: TrendsResponse, latest: string): NetworkDirEntry[] {
  const agg = new Map<number, { name: string; type: string; cap: number; metros: Set<string>; ix: number }>();
  for (const r of fd.networkTrend) {
    if (r.snapshotDate !== latest) continue;
    const e = agg.get(r.asn) || { name: r.networkName, type: r.networkType || "—", cap: 0, metros: new Set<string>(), ix: 0 };
    e.cap += r.capacityMbps || 0;
    e.metros.add(r.metro);
    e.ix += r.ixCount || 0;
    e.name = r.networkName;
    e.type = r.networkType || e.type;
    agg.set(r.asn, e);
  }
  return Array.from(agg.entries())
    .map(([asn, e]) => ({ asn, name: e.name, type: e.type, capT: e.cap / 1e6, metros: e.metros.size, ports: e.ix }))
    .sort((a, b) => b.capT - a.capT);
}

export interface ExchangeMember {
  asn: number;
  name: string;
  capG: number;
}

export interface ExchangeMove {
  asn: number;
  name: string;
  capG: number;
  fromG?: number;
  toG?: number;
}

export interface ExchangeRival {
  asn: number;
  name: string;
  bestRivalIx: string;
  bestRivalG: number;
  totalRivalG: number;
}

export interface ExchangeProfile {
  ixId: number;
  name: string;
  metro: string;
  isEquinix: boolean;
  capT: number;
  nets: number;
  shareOfMetroPct: number;
  metroRank: number;
  metroIxCount: number;
  capSeries: number[];
  netSeries: number[];
  snapshots: string[];
  members: ExchangeMember[];
  memberCount: number;
  joined: ExchangeMove[];
  left: ExchangeMove[];
  upgraded: ExchangeMove[];
  rivalsNotHere: ExchangeRival[];
}

/** Full snapshot-based profile for one exchange. Uses UNFILTERED data —
    an exchange page always shows its whole metro context. */
export function exchangeProfile(d: TrendsResponse, ixId: number): ExchangeProfile | null {
  const snapshots = uniqSorted(d.snapshots);
  const latest = snapshots[snapshots.length - 1];
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : latest;

  const ixRows = d.ixTrend.filter((r) => r.ixId === ixId);
  if (!ixRows.length) return null;
  const latestRow = ixRows.find((r) => r.snapshotDate === latest) || ixRows[ixRows.length - 1];
  const metro = latestRow.metro;
  const name = latestRow.ixName;

  const capSeries = snapshots.map((s) =>
    ixRows.filter((r) => r.snapshotDate === s).reduce((a, r) => a + (r.capacityMbps || 0) / 1e6, 0)
  );
  const netSeries = snapshots.map((s) =>
    ixRows.filter((r) => r.snapshotDate === s).reduce((a, r) => Math.max(a, r.networkCount || 0), 0)
  );
  const capT = capSeries[capSeries.length - 1];
  const nets = netSeries[netSeries.length - 1];

  /* metro context */
  const metroIxs = new Map<number, number>();
  for (const r of d.ixTrend) {
    if (r.snapshotDate === latest && r.metro === metro) {
      metroIxs.set(r.ixId, (metroIxs.get(r.ixId) || 0) + (r.capacityMbps || 0) / 1e6);
    }
  }
  const metroTotal = Array.from(metroIxs.values()).reduce((a, b) => a + b, 0);
  const ranked = Array.from(metroIxs.entries()).sort((a, b) => b[1] - a[1]);
  const metroRank = ranked.findIndex(([id]) => id === ixId) + 1;

  /* members latest vs prev */
  const membersAt = (snap: string) => {
    const m = new Map<number, { name: string; capG: number }>();
    for (const r of d.networkIxTrend) {
      if (r.snapshotDate !== snap || r.ixId !== ixId) continue;
      const e = m.get(r.asn) || { name: r.networkName, capG: 0 };
      e.capG += (r.capacityMbps || 0) / 1000;
      e.name = r.networkName;
      m.set(r.asn, e);
    }
    return m;
  };
  const cur = membersAt(latest);
  const before = membersAt(prev);

  const members: ExchangeMember[] = Array.from(cur.entries())
    .map(([asn, e]) => ({ asn, name: e.name, capG: e.capG }))
    .sort((a, b) => b.capG - a.capG);

  const joined: ExchangeMove[] = [];
  const left: ExchangeMove[] = [];
  const upgraded: ExchangeMove[] = [];
  cur.forEach((e, asn) => {
    const p = before.get(asn);
    if (!p) joined.push({ asn, name: e.name, capG: e.capG });
    else if (e.capG - p.capG >= 100) upgraded.push({ asn, name: e.name, capG: e.capG - p.capG, fromG: p.capG, toG: e.capG });
  });
  before.forEach((e, asn) => {
    if (!cur.has(asn)) left.push({ asn, name: e.name, capG: e.capG });
  });
  joined.sort((a, b) => b.capG - a.capG);
  left.sort((a, b) => b.capG - a.capG);
  upgraded.sort((a, b) => b.capG - a.capG);

  /* competitive gap list: on other exchanges in this metro, not on this one */
  const rivals = new Map<number, ExchangeRival>();
  const isRouteServer = (n: string) => /route server|route-server|rs[0-9]* ?only/i.test(n);
  for (const r of d.networkIxTrend) {
    if (r.snapshotDate !== latest || r.metro !== metro || r.ixId === ixId) continue;
    if (cur.has(r.asn)) continue;
    if (isRouteServer(r.networkName || "")) continue; // infrastructure ASNs aren't prospects
    const g = (r.capacityMbps || 0) / 1000;
    const e = rivals.get(r.asn) || {
      asn: r.asn,
      name: r.networkName,
      bestRivalIx: r.ixName,
      bestRivalG: g,
      totalRivalG: 0,
    };
    e.totalRivalG += g;
    if (g > e.bestRivalG) {
      e.bestRivalG = g;
      e.bestRivalIx = r.ixName;
    }
    rivals.set(r.asn, e);
  }
  const rivalsNotHere = Array.from(rivals.values())
    .sort((a, b) => b.totalRivalG - a.totalRivalG)
    .slice(0, 10);

  return {
    ixId,
    name,
    metro,
    isEquinix: isEquinixIx(name),
    capT,
    nets,
    shareOfMetroPct: metroTotal ? (capT / metroTotal) * 100 : 0,
    metroRank,
    metroIxCount: ranked.length,
    capSeries,
    netSeries,
    snapshots,
    members,
    memberCount: members.length,
    joined,
    left,
    upgraded,
    rivalsNotHere,
  };
}

/* ---------------- network profile ---------------- */

export interface NetworkMetroFootprint {
  metro: string;
  country: string;
  capT: number;
  ixCount: number;
  facCount: number;
}

export interface NetworkPort {
  ixId: number;
  ixName: string;
  metro: string;
  isEquinix: boolean;
  capG: number;
  dCapG: number;
}

export interface NetworkProfile {
  asn: number;
  netId: number;
  name: string;
  type: string;
  found: boolean;
  totalCapT: number;
  dCapT: number;
  metroCount: number;
  ixCount: number;
  facCount: number;
  snapshots: string[];
  capSeries: number[];
  footprint: NetworkMetroFootprint[];
  ports: NetworkPort[];
  joined: NetworkPort[];
  left: NetworkPort[];
  upgraded: NetworkPort[];
}

/** Snapshot-based profile for one ASN. Uses UNFILTERED data — a network's
    footprint spans metros regardless of the current scope. */
export function networkProfile(d: TrendsResponse, asn: number): NetworkProfile {
  const snapshots = uniqSorted(d.snapshots);
  const latest = snapshots[snapshots.length - 1];
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : latest;

  const nRows = d.networkTrend.filter((r) => r.asn === asn);
  const latestRow = nRows.find((r) => r.snapshotDate === latest);
  const name = latestRow?.networkName || nRows[nRows.length - 1]?.networkName || `AS${asn}`;
  const type = latestRow?.networkType || nRows[nRows.length - 1]?.networkType || "—";
  const netId = latestRow?.networkId ?? nRows[nRows.length - 1]?.networkId ?? 0;

  const capSeries = snapshots.map((s) =>
    nRows.filter((r) => r.snapshotDate === s).reduce((a, r) => a + mbpsToT(r.capacityMbps), 0)
  );

  // per-metro footprint (latest)
  const metroCountry = new Map(d.metros.map((m) => [m.key, m.country]));
  const footprint: NetworkMetroFootprint[] = nRows
    .filter((r) => r.snapshotDate === latest)
    .map((r) => ({
      metro: r.metro,
      country: metroCountry.get(r.metro) || "",
      capT: mbpsToT(r.capacityMbps),
      ixCount: r.ixCount || 0,
      facCount: r.facilityCount || 0,
    }))
    .sort((a, b) => b.capT - a.capT);

  // per-IX ports (latest vs prev)
  const portsAt = (snap: string) => {
    const m = new Map<number, NetworkPort>();
    for (const r of d.networkIxTrend) {
      if (r.snapshotDate !== snap || r.asn !== asn) continue;
      const e = m.get(r.ixId) || {
        ixId: r.ixId,
        ixName: r.ixName || `IX ${r.ixId}`,
        metro: r.metro,
        isEquinix: isEquinixIx(r.ixName),
        capG: 0,
        dCapG: 0,
      };
      e.capG += (r.capacityMbps || 0) / 1000;
      m.set(r.ixId, e);
    }
    return m;
  };
  const cur = portsAt(latest);
  const before = portsAt(prev);
  const ports: NetworkPort[] = Array.from(cur.values())
    .map((p) => ({ ...p, dCapG: p.capG - (before.get(p.ixId)?.capG || 0) }))
    .sort((a, b) => b.capG - a.capG);

  const joined: NetworkPort[] = [];
  const left: NetworkPort[] = [];
  const upgraded: NetworkPort[] = [];
  cur.forEach((p, id) => {
    const b = before.get(id);
    if (!b) joined.push({ ...p, dCapG: p.capG });
    else if (p.capG - b.capG >= 100) upgraded.push({ ...p, dCapG: p.capG - b.capG });
  });
  before.forEach((p, id) => {
    if (!cur.has(id)) left.push({ ...p, dCapG: -p.capG });
  });
  joined.sort((a, b) => b.capG - a.capG);
  left.sort((a, b) => b.capG - a.capG);
  upgraded.sort((a, b) => b.dCapG - a.dCapG);

  const totalCapT = capSeries[capSeries.length - 1] || 0;
  const dCapT = totalCapT - (capSeries[capSeries.length - 2] ?? totalCapT);
  const facCount = footprint.reduce((a, f) => a + f.facCount, 0);

  return {
    asn,
    netId,
    name,
    type,
    found: footprint.length > 0 || ports.length > 0,
    totalCapT,
    dCapT,
    metroCount: footprint.length,
    ixCount: ports.length,
    facCount,
    snapshots,
    capSeries,
    footprint,
    ports,
    joined,
    left,
    upgraded,
  };
}

/* ---------------- live explore support ---------------- */

export interface MetroExchange {
  ixId: number;
  ixName: string;
  isEquinix: boolean;
}

/** The exchanges that belong to a metro, from the latest snapshot — used to
    scope a live netixlan fetch without re-deriving metro membership. */
export function metroExchanges(d: TrendsResponse, metro: string): MetroExchange[] {
  const seen = new Map<number, MetroExchange>();
  const latest = uniqSorted(d.snapshots).slice(-1)[0];
  for (const r of d.ixTrend) {
    if (r.snapshotDate === latest && r.metro === metro && !seen.has(r.ixId)) {
      seen.set(r.ixId, { ixId: r.ixId, ixName: r.ixName || `IX ${r.ixId}`, isEquinix: isEquinixIx(r.ixName) });
    }
  }
  return Array.from(seen.values());
}

/** net_id -> {name, asn} from the latest snapshot; names change rarely, so this
    labels live netixlan rows without a second live round-trip. */
export function snapshotNetNames(d: TrendsResponse): Map<number, { name: string; asn: number }> {
  const m = new Map<number, { name: string; asn: number }>();
  const latest = uniqSorted(d.snapshots).slice(-1)[0];
  for (const r of d.networkTrend) {
    if (r.snapshotDate === latest && !m.has(r.networkId)) m.set(r.networkId, { name: r.networkName, asn: r.asn });
  }
  return m;
}

/* ---------------- watchlist ---------------- */

const WATCHLIST_KEY = "pdb-watchlist-asns";
const DEFAULT_WATCHLIST = [20940, 16509, 32934, 13335, 8075, 2906];

export function loadWatchlist(): number[] {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return DEFAULT_WATCHLIST;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isFinite(n)) : DEFAULT_WATCHLIST;
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

export function saveWatchlist(asns: number[]) {
  try {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(asns));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function watchRows(d: TrendsResponse, latest: string, prev: string, asns: number[]): WatchRow[] {
  const cur = apacNetworkCap(d, latest);
  const before = apacNetworkCap(d, prev);
  const metrosOf = (asn: number) => {
    const s = new Set<string>();
    for (const r of d.networkTrend) if (r.snapshotDate === latest && r.asn === asn) s.add(r.metro);
    return s.size;
  };
  return asns.map((asn) => {
    const e = cur.get(asn);
    return {
      asn,
      name: e?.name || `AS${asn}`,
      metros: e ? metrosOf(asn) : 0,
      capT: mbpsToT(e?.cap),
      dCapT: mbpsToT(e?.cap) - mbpsToT(before.get(asn)?.cap),
      found: Boolean(e),
    };
  });
}
