import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { fetchPeeringDb } from "../peeringdbApi";
import { useSnapshot } from "./Shell";
import { EntityTypeahead, NetworkTypeahead, useTooltip } from "./bits";
import {
  METRO_CODES,
  NetworkProfile,
  exchangesRanking,
  facilitiesRanking,
  filterByMetros,
  fmtDayMonth,
  networkProfile,
  networkScopeSeries,
  networksDirectory,
  topNetworksOnIxs,
} from "./data";

/* Analysis — the multi-network workbench. Any set of networks × the scoped
   metros (metro pivot) or × a hand-picked set of exchanges (exchange pivot).
   Layers: capacity matrix with metric toggle → per-metro exchange matrices →
   live facility presence → capacity trend lines. Selection lives in the URL
   (?nets= & ?ixs=), so an analysis is a shareable link. */

const SEG = ["#2BB0C4", "#4F86D6", "#3FB27F", "#E0A73C", "#D8617D", "#7C8AA0", "#8A6FE8", "#4FB5A5"];
const MAX_NETS = 8;

const tLabel = (t: number) => (t >= 1 ? `${t.toFixed(1)}T` : t > 0.0005 ? `${(t * 1000).toFixed(0)}G` : "—");
const gLbl = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(1)}T` : g > 0.5 ? `${g.toFixed(0)}G` : "—");
const dLbl = (t: number) =>
  Math.abs(t) < 0.005 ? "" : `${t > 0 ? "▲" : "▼"}${Math.abs(t) >= 1 ? Math.abs(t).toFixed(1) + "T" : (Math.abs(t) * 1000).toFixed(0) + "G"}`;

type Metric = "cap" | "eqx" | "delta" | "ix" | "dc";
const METRICS: Array<{ id: Metric; label: string }> = [
  { id: "cap", label: "Capacity" },
  { id: "eqx", label: "Equinix %" },
  { id: "delta", label: "Δ MoM" },
  { id: "ix", label: "IXs" },
  { id: "dc", label: "DCs" },
];

interface MStat {
  capT: number;
  eqxPct: number;
  dT: number;
  ix: number;
  dc: number;
}

function metroStat(p: NetworkProfile, metro: string): MStat {
  const f = p.footprint.find((x) => x.metro === metro);
  const ports = p.ports.filter((x) => x.metro === metro);
  const capT = f?.capT ?? 0;
  const eqxT = ports.filter((x) => x.isEquinix).reduce((a, x) => a + x.capG, 0) / 1000;
  const dT =
    (ports.reduce((a, x) => a + x.dCapG, 0) + p.left.filter((x) => x.metro === metro).reduce((a, x) => a + x.dCapG, 0)) / 1000;
  return { capT, eqxPct: capT > 0 ? (eqxT / capT) * 100 : 0, dT, ix: f?.ixCount ?? 0, dc: f?.facCount ?? 0 };
}

function downloadCsv(name: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* multi-line capacity trend chart */
function TrendChart({ labels, series }: { labels: string[]; series: Array<{ name: string; color: string; points: number[] }> }) {
  const W = 640;
  const H = 170;
  const PAD = { l: 8, r: 130, t: 12, b: 22 };
  const max = Math.max(0.001, ...series.flatMap((s) => s.points));
  const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * i) / Math.max(labels.length - 1, 1);
  const y = (v: number) => H - PAD.b - ((H - PAD.t - PAD.b) * v) / max;
  return (
    <div className="rd-trend">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Capacity trend by network">
        {labels.map((l, i) => (
          <text key={l} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9.5" fill="var(--faint)">
            {l}
          </text>
        ))}
        {series.map((s) => {
          const d = s.points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
          const last = s.points[s.points.length - 1];
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
              <circle cx={x(s.points.length - 1)} cy={y(last)} r="3" fill={s.color} />
              <text x={x(s.points.length - 1) + 7} y={y(last) + 3.5} fontSize="10" fontWeight="700" fill={s.color}>
                {s.name.length > 14 ? `${s.name.slice(0, 13)}…` : s.name} {last.toFixed(1)}T
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function ComparePage() {
  const { data, scoped, derived, scopeName, asOf } = useSnapshot();
  const { search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { bind, node: tipNode } = useTooltip();

  /* ---------- selection (URL-backed) ---------- */
  const parseIds = (key: string) =>
    (searchParams.get(key) || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const asns = useMemo(() => parseIds("nets").slice(0, MAX_NETS), [searchParams]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ixs = useMemo(() => parseIds("ixs"), [searchParams]);
  const setIds = (key: string, list: number[]) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (list.length) next.set(key, list.join(","));
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  const setAsns = (l: number[]) => setIds("nets", Array.from(new Set(l)).slice(0, MAX_NETS));
  const setIxs = (l: number[]) => setIds("ixs", Array.from(new Set(l)));

  const pivot: "metro" | "exchange" = ixs.length ? "exchange" : "metro";

  /* ---------- directories & meta ---------- */
  const dir = useMemo(() => networksDirectory(data, derived.latest), [data, derived.latest]);
  const dirScoped = useMemo(() => networksDirectory(scoped, derived.latest), [scoped, derived.latest]);
  const ixAll = useMemo(() => exchangesRanking(data, derived.latest), [data, derived.latest]);
  const ixMeta = useMemo(() => new Map(ixAll.map((x) => [x.ixId, x])), [ixAll]);
  const ixOptions = useMemo(
    () => ixAll.map((x) => ({ id: x.ixId, name: x.name, sub: x.metro, meta: `${x.capT.toFixed(1)}T`, extra: x.metro })),
    [ixAll]
  );
  const eqxInScope = useMemo(
    () =>
      exchangesRanking(scoped, derived.latest)
        .filter((x) => x.isEquinix)
        .map((x) => x.ixId),
    [scoped, derived.latest]
  );

  /* ---------- rows ---------- */
  const effAsns = useMemo(
    () => (asns.length ? asns : pivot === "exchange" ? topNetworksOnIxs(data, ixs, asOf, 10) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asns.join(","), pivot, ixs.join(","), data, asOf]
  );
  const profiles = useMemo(
    () => effAsns.map((a) => networkProfile(data, a, asOf)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, effAsns.join(","), asOf]
  );
  const metros = derived.metros.map((m) => m.metro);

  /* ---------- live facility presence (per selected network, capped) ---------- */
  const [facMap, setFacMap] = useState<Record<number, { loading: boolean; facIds: number[] }>>({});
  useEffect(() => {
    if (!asns.length) return; // facilities only for explicitly selected networks
    let alive = true;
    profiles.forEach((p) => {
      if (!p.found || !p.netId || facMap[p.asn]) return;
      setFacMap((m) => ({ ...m, [p.asn]: { loading: true, facIds: [] } }));
      fetchPeeringDb<any>("netfac", { net_id: p.netId, all: 1 })
        .then((resp) => {
          if (!alive) return;
          setFacMap((m) => ({ ...m, [p.asn]: { loading: false, facIds: resp.data.map((r: any) => r.fac_id) } }));
        })
        .catch(() => alive && setFacMap((m) => ({ ...m, [p.asn]: { loading: false, facIds: [] } })));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, asns.length]);

  /* ---------- metric state + heat ---------- */
  const [metric, setMetric] = useState<Metric>("cap");
  const stats = useMemo(
    () => profiles.map((p) => metros.map((m) => metroStat(p, m))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, metros.join("|")]
  );
  const maxCap = Math.max(0.001, ...stats.flat().map((s) => s.capT));
  const maxAbsD = Math.max(0.001, ...stats.flat().map((s) => Math.abs(s.dT)));
  const maxCnt = Math.max(1, ...stats.flat().map((s) => (metric === "dc" ? s.dc : s.ix)));
  const heatBg = (s: MStat) => {
    if (metric === "cap") {
      if (s.capT <= 0) return undefined;
      return `color-mix(in srgb, var(--accent) ${Math.round(6 + Math.sqrt(s.capT / maxCap) * 40)}%, var(--surface))`;
    }
    if (metric === "eqx") {
      if (s.capT <= 0) return undefined;
      return `color-mix(in srgb, var(--equinix) ${Math.round(6 + (s.eqxPct / 100) * 48)}%, var(--surface))`;
    }
    if (metric === "delta") {
      if (Math.abs(s.dT) < 0.005) return undefined;
      const hue = s.dT > 0 ? "var(--present)" : "var(--gap)";
      return `color-mix(in srgb, ${hue} ${Math.round(8 + Math.sqrt(Math.abs(s.dT) / maxAbsD) * 50)}%, var(--surface))`;
    }
    const v = metric === "dc" ? s.dc : s.ix;
    if (!v) return undefined;
    return `color-mix(in srgb, var(--accent) ${Math.round(5 + (v / maxCnt) * 30)}%, var(--surface))`;
  };
  const cellText = (s: MStat) => {
    if (metric === "cap") return tLabel(s.capT);
    if (metric === "eqx") return s.capT > 0 ? `${s.eqxPct.toFixed(0)}%` : "—";
    if (metric === "delta")
      return Math.abs(s.dT) < 0.005
        ? "·"
        : `${s.dT > 0 ? "+" : "−"}${Math.abs(s.dT) >= 1 ? Math.abs(s.dT).toFixed(1) + "T" : (Math.abs(s.dT) * 1000).toFixed(0) + "G"}`;
    return String((metric === "dc" ? s.dc : s.ix) || "—");
  };

  /* ---------- CSV ---------- */
  const exportCsv = () => {
    if (pivot === "metro") {
      const head = ["network", "asn", ...metros];
      const rows = profiles.map((p, i) => [
        p.name,
        p.asn,
        ...metros.map((_, j) => {
          const s = stats[i][j];
          return metric === "cap"
            ? s.capT.toFixed(3)
            : metric === "eqx"
            ? s.eqxPct.toFixed(1)
            : metric === "delta"
            ? s.dT.toFixed(3)
            : metric === "dc"
            ? s.dc
            : s.ix;
        }),
      ]);
      downloadCsv(`analysis-${metric}-by-metro.csv`, [head, ...rows]);
    } else {
      const head = ["network", "asn", ...ixs.map((id) => ixMeta.get(id)?.name || `IX ${id}`)];
      const rows = profiles.map((p) => [
        p.name,
        p.asn,
        ...ixs.map((id) => ((p.ports.find((x) => x.ixId === id)?.capG || 0) / 1000).toFixed(3)),
      ]);
      downloadCsv("analysis-by-exchange.csv", [head, ...rows]);
    }
  };

  /* ---------- per-metro blocks (metro pivot) ---------- */
  const metroBlocks = useMemo(() => {
    if (pivot !== "metro" || !profiles.length) return [];
    return metros
      .map((metro) => {
        const colAgg = new Map<number, { name: string; eqx: boolean; total: number }>();
        profiles.forEach((p) =>
          p.ports
            .filter((x) => x.metro === metro)
            .forEach((x) => {
              const e = colAgg.get(x.ixId) || { name: x.ixName, eqx: x.isEquinix, total: 0 };
              e.total += x.capG;
              colAgg.set(x.ixId, e);
            })
        );
        const cols = Array.from(colAgg.entries())
          .map(([ixId, v]) => ({ ixId, ...v }))
          .sort((a, b) => (a.eqx !== b.eqx ? (a.eqx ? -1 : 1) : b.total - a.total))
          .slice(0, 8);
        const facCols = facilitiesRanking(filterByMetros(data, [metro]), derived.latest).slice(0, 8);
        return { metro, cols, facCols };
      })
      .filter((b) => b.cols.length > 0);
  }, [pivot, profiles, metros, data, derived.latest]);

  const trendSeries = useMemo(
    () =>
      profiles.slice(0, 8).map((p, i) => ({
        name: p.name,
        color: SEG[i % SEG.length],
        points: networkScopeSeries(scoped, p.asn, asOf),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, scoped, asOf]
  );
  const trendLabels = derived.snapshots.map((s) => fmtDayMonth(s));

  const suggestions = dirScoped.slice(0, 5).filter((s) => !asns.includes(s.asn));
  const cellPort = (p: NetworkProfile, ixId: number) => p.ports.find((x) => x.ixId === ixId);
  const ixColTotals = ixs.map((id) => profiles.reduce((a, p) => a + (cellPort(p, id)?.capG || 0), 0));
  const maxIxCell = Math.max(1, ...profiles.flatMap((p) => ixs.map((id) => cellPort(p, id)?.capG || 0)));

  return (
    <>
      {/* ---------- selection bar ---------- */}
      <div className="rd-slider-bar" style={{ alignItems: "flex-start", gap: 14 }}>
        <div style={{ minWidth: 250, flex: 1, maxWidth: 360 }}>
          <NetworkTypeahead
            options={dir}
            onPick={(a) => !asns.includes(a) && setAsns([...asns, a])}
            onPickMany={(list) => setAsns([...asns, ...list])}
            exclude={new Set(asns)}
            placeholder="Add networks — names or ASNs…"
          />
          {asns.length ? (
            <div className="rd-chips" style={{ marginTop: 8, marginBottom: 0 }}>
              {asns.map((a) => {
                const nm = profiles.find((r) => r.asn === a)?.name || `AS${a}`;
                return (
                  <button key={a} className="rd-chip on" onClick={() => setAsns(asns.filter((x) => x !== a))} title="Remove">
                    {nm.length > 18 ? `${nm.slice(0, 17)}…` : nm} ✕
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div style={{ minWidth: 250, flex: 1, maxWidth: 360 }}>
          <EntityTypeahead
            options={ixOptions}
            onPick={(id) => !ixs.includes(id) && setIxs([...ixs, id])}
            onPickMany={(list) => setIxs([...ixs, ...list])}
            exclude={new Set(ixs)}
            placeholder="Pivot by exchanges — IX names…"
          />
          <div className="rd-chips" style={{ marginTop: 8, marginBottom: 0 }}>
            <button className="rd-chip" onClick={() => setIxs(eqxInScope)} title="Select every Equinix exchange in scope">
              ◆ All Equinix
            </button>
            {ixs.map((id) => {
              const m = ixMeta.get(id);
              const nm = m?.name || `IX ${id}`;
              return (
                <button
                  key={id}
                  className="rd-chip on"
                  style={
                    m?.isEquinix
                      ? {
                          borderColor: "color-mix(in srgb, var(--equinix) 45%, transparent)",
                          color: "var(--equinix)",
                          background: "var(--equinix-bg)",
                        }
                      : undefined
                  }
                  onClick={() => setIxs(ixs.filter((x) => x !== id))}
                  title="Remove"
                >
                  {nm.length > 18 ? `${nm.slice(0, 17)}…` : nm} ✕
                </button>
              );
            })}
            {ixs.length ? (
              <button className="rd-chip" onClick={() => setIxs([])}>
                clear ✕
              </button>
            ) : null}
          </div>
        </div>
        <div className="rd-grow" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <span className="note rd-num">
            {effAsns.length} network{effAsns.length === 1 ? "" : "s"} ·{" "}
            {pivot === "exchange" ? `${ixs.length} exchanges` : `${metros.length} metros · ${scopeName}`}
          </span>
          {effAsns.length ? (
            <button className="rd-btn" onClick={exportCsv}>
              ↓ Export CSV
            </button>
          ) : null}
        </div>
      </div>

      {!effAsns.length ? (
        <div className="rd-center">
          <h3>Pick networks to analyse</h3>
          <p style={{ marginBottom: 14 }}>
            Type several names or ASNs and press Enter — or pivot by exchanges (try “All Equinix”). Start from the
            biggest in scope:
          </p>
          <div className="rd-chips" style={{ justifyContent: "center" }}>
            {suggestions.map((s) => (
              <button key={s.asn} className="rd-chip" onClick={() => setAsns([...asns, s.asn])}>
                + {s.name.length > 22 ? `${s.name.slice(0, 21)}…` : s.name}
              </button>
            ))}
          </div>
        </div>
      ) : pivot === "exchange" ? (
        <>
          {/* ---------- exchange pivot ---------- */}
          <div className="rd-sec-head">
            <h2>Deployment across exchanges</h2>
            <span className="note">
              {asns.length ? "Your networks" : "Top networks on these exchanges"} · cell = port capacity + MoM change ·
              Equinix violet
            </span>
          </div>
          <div className="rd-heatwrap">
            <table className="rd-amx">
              <thead>
                <tr>
                  <th className="who">Network</th>
                  {ixs.map((id) => {
                    const m = ixMeta.get(id);
                    return (
                      <th key={id} className={m?.isEquinix ? "eqx" : ""}>
                        <Link to={{ pathname: `/exchange/${id}`, search }}>{m?.name || `IX ${id}`}</Link>
                        <span className="mx">{m?.metro || ""}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.asn}>
                    <td className="who">
                      <Link to={{ pathname: `/net/${p.asn}`, search }} className="nm rd-netlink">
                        {p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name}
                      </Link>
                      <span className="sub rd-num">AS{p.asn}</span>
                    </td>
                    {ixs.map((id) => {
                      const port = cellPort(p, id);
                      const g = port?.capG || 0;
                      return (
                        <td
                          key={id}
                          className={`cell rd-num${ixMeta.get(id)?.isEquinix ? " eqxcol" : ""}`}
                          style={
                            g
                              ? {
                                  background: `color-mix(in srgb, var(--accent) ${Math.round(
                                    6 + Math.sqrt(g / maxIxCell) * 40
                                  )}%, var(--surface))`,
                                }
                              : undefined
                          }
                          {...(g
                            ? bind(
                                <>
                                  <div className="th">{p.name}</div>
                                  <div className="tl">
                                    <span>{ixMeta.get(id)?.name}</span>
                                    <b>{gLbl(g)}</b>
                                  </div>
                                  {port && Math.abs(port.dCapG) > 0.5 ? (
                                    <div className="tl">
                                      <span>vs last month</span>
                                      <b className={port.dCapG > 0 ? "rd-up" : "rd-down"}>
                                        {port.dCapG > 0 ? "+" : "−"}
                                        {Math.abs(port.dCapG).toFixed(0)}G
                                      </b>
                                    </div>
                                  ) : null}
                                </>
                              )
                            : {})}
                        >
                          <span>{gLbl(g)}</span>
                          {port && Math.abs(port.dCapG) > 0.5 ? (
                            <span className={`d ${port.dCapG > 0 ? "rd-up" : "rd-down"}`}>{dLbl(port.dCapG / 1000)}</span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="totals">
                  <td className="who">Combined</td>
                  {ixs.map((id, j) => (
                    <td key={id} className={`cell rd-num${ixMeta.get(id)?.isEquinix ? " eqxcol" : ""}`}>
                      <span style={{ fontWeight: 700 }}>{gLbl(ixColTotals[j])}</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="rd-footnote" style={{ marginTop: 10 }}>
            The exchange pivot spans metros regardless of the metro scope. Column headers open the exchange profile;
            "Combined" is the selected networks' total on each exchange.
          </div>
        </>
      ) : (
        <>
          {/* ---------- metro pivot: capacity matrix ---------- */}
          <div className="rd-sec-head">
            <h2>Capacity matrix</h2>
            <div className="rd-chips" style={{ marginBottom: 0 }}>
              {METRICS.map((m) => (
                <button key={m.id} className={`rd-chip${metric === m.id ? " on" : ""}`} onClick={() => setMetric(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rd-heatwrap">
            <table className="rd-amx">
              <thead>
                <tr>
                  <th className="who">Network</th>
                  {metros.map((m) => (
                    <th key={m}>
                      <Link to={{ pathname: `/metro/${encodeURIComponent(m)}`, search }}>{METRO_CODES[m] || m}</Link>
                      <span className="mx">{m}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map((p, i) => (
                  <tr key={p.asn}>
                    <td className="who">
                      <Link to={{ pathname: `/net/${p.asn}`, search }} className="nm rd-netlink">
                        {p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name}
                      </Link>
                      <span className="sub rd-num">AS{p.asn}</span>
                    </td>
                    {metros.map((m, j) => {
                      const s = stats[i][j];
                      return (
                        <td
                          key={m}
                          className="cell rd-num"
                          style={{ background: heatBg(s) }}
                          {...(s.capT > 0
                            ? bind(
                                <>
                                  <div className="th">
                                    {p.name} · {m}
                                  </div>
                                  <div className="tl">
                                    <span>Capacity</span>
                                    <b>{tLabel(s.capT)}</b>
                                  </div>
                                  <div className="tl">
                                    <span>Equinix share</span>
                                    <b>{s.eqxPct.toFixed(0)}%</b>
                                  </div>
                                  <div className="tl">
                                    <span>MoM</span>
                                    <b className={s.dT >= 0 ? "rd-up" : "rd-down"}>
                                      {s.dT >= 0 ? "+" : "−"}
                                      {Math.abs(s.dT).toFixed(2)}T
                                    </b>
                                  </div>
                                  <div className="tl">
                                    <span>Footprint</span>
                                    <b>
                                      {s.ix} IX · {s.dc} DC
                                    </b>
                                  </div>
                                </>
                              )
                            : {})}
                        >
                          <span>{cellText(s)}</span>
                          {metric === "cap" && Math.abs(s.dT) >= 0.005 ? (
                            <span className={`d ${s.dT > 0 ? "rd-up" : "rd-down"}`}>{dLbl(s.dT)}</span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---------- per-metro exchange + facility matrices ---------- */}
          <div className="rd-sec-head" style={{ marginTop: 26 }}>
            <h2>Exchange detail by metro</h2>
            <span className="note">
              Which exchange each network sits on, per market · Equinix violet · dot = facility presence (live)
            </span>
          </div>
          {metroBlocks.map((b) => (
            <div className="rd-metroblock" key={b.metro}>
              <div className="rd-mb-head">
                <Link className="name" to={{ pathname: `/metro/${encodeURIComponent(b.metro)}`, search }}>
                  {b.metro}
                </Link>
                <span className="rd-cc">{METRO_CODES[b.metro] || ""}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="rd-amx compact">
                  <thead>
                    <tr>
                      <th className="who" />
                      {b.cols.map((c) => (
                        <th key={c.ixId} className={c.eqx ? "eqx" : ""}>
                          <Link to={{ pathname: `/exchange/${c.ixId}`, search }}>
                            {c.name.length > 15 ? `${c.name.slice(0, 14)}…` : c.name}
                          </Link>
                        </th>
                      ))}
                      {asns.length && b.facCols.length ? <th className="gap" /> : null}
                      {asns.length
                        ? b.facCols.map((f) => (
                            <th key={`f${f.facilityId}`} className={`fac${f.isEquinix ? " eqx" : ""}`} title={`${f.name} · ${f.org}`}>
                              {f.name.length > 13 ? `${f.name.slice(0, 12)}…` : f.name}
                            </th>
                          ))
                        : null}
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((p) => {
                      const fm = facMap[p.asn];
                      return (
                        <tr key={p.asn}>
                          <td className="who">
                            <Link to={{ pathname: `/net/${p.asn}`, search }} className="nm rd-netlink">
                              {p.name.length > 20 ? `${p.name.slice(0, 19)}…` : p.name}
                            </Link>
                          </td>
                          {b.cols.map((c) => {
                            const port = p.ports.find((x) => x.ixId === c.ixId);
                            const g = port?.capG || 0;
                            return (
                              <td
                                key={c.ixId}
                                className={`cell rd-num${c.eqx ? " eqxcol" : ""}`}
                                style={
                                  g
                                    ? {
                                        background: `color-mix(in srgb, ${c.eqx ? "var(--equinix)" : "var(--accent)"} ${Math.round(
                                          8 + Math.sqrt(g / Math.max(c.total, 1)) * 34
                                        )}%, var(--surface))`,
                                      }
                                    : undefined
                                }
                              >
                                {gLbl(g)}
                              </td>
                            );
                          })}
                          {asns.length && b.facCols.length ? <td className="gap" /> : null}
                          {asns.length
                            ? b.facCols.map((f) => {
                                const present = fm && !fm.loading && fm.facIds.includes(f.facilityId);
                                return (
                                  <td key={`f${f.facilityId}`} className={`cell dot${f.isEquinix ? " eqxcol" : ""}`}>
                                    {fm?.loading ? "…" : present ? <span className={f.isEquinix ? "p eqx" : "p"}>●</span> : "·"}
                                  </td>
                                );
                              })
                            : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ---------- trends ---------- */}
      {effAsns.length && trendLabels.length > 1 ? (
        <>
          <div className="rd-sec-head" style={{ marginTop: 26 }}>
            <h2>Capacity trend — {scopeName}</h2>
            <span className="note">Each network's deployed capacity within the scoped metros, per snapshot</span>
          </div>
          <div className="rd-heatwrap" style={{ padding: 14 }}>
            <TrendChart labels={trendLabels} series={trendSeries} />
          </div>
        </>
      ) : null}

      {effAsns.length ? (
        <div className="rd-footnote">
          Selections live in the URL — copy the link to share this exact analysis. Facilities are fetched live from
          PeeringDB for explicitly selected networks (max {MAX_NETS}); capacities are snapshot-based and follow the
          global time slider.
        </div>
      ) : null}
      {tipNode}
    </>
  );
}
