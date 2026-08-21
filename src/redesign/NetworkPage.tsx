import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { fetchPeeringDb } from "../peeringdbApi";
import { useSnapshot } from "./Shell";
import { Bar, Kpi, NetworkTypeahead, Panel, useTooltip } from "./bits";
import {
  METRO_CODES,
  NetworkPort,
  facilitiesRanking,
  facilityMeta,
  fmtMonth,
  loadWatchlist,
  networkProfile,
  networksDirectory,
  saveWatchlist,
  allocationCsvRows,
  saveCsv,
} from "./data";

/* Network deep dive. The allocation & presence section renders ONE block
   per scoped metro — stacked bar of that metro's IX allocation plus its
   facilities — all visible at once, no clicking. Markets are never blended.
   Clicking a footprint row just scrolls to that metro's block. */

// categorical palette for stacked-bar segments (reads on light and dark)
const SEG = ["#2BB0C4", "#4F86D6", "#3FB27F", "#E0A73C", "#D8617D", "#7C8AA0"];
const segColor = (port: NetworkPort, i: number) => (port.isEquinix ? "var(--equinix)" : SEG[i % SEG.length]);
const gLabel = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(1)}T` : `${g.toFixed(0)}G`);

interface FacRow {
  facId: number;
  name: string;
  org: string;
  metro: string | null;
  isEquinix: boolean;
  city: string;
  country: string;
}

export default function NetworkPage() {
  const { data, derived, scope, scopeName, asOf } = useSnapshot();
  const { asn } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const { bind, node: tipNode } = useTooltip();

  const p = useMemo(() => networkProfile(data, Number(asn), asOf), [data, asn, asOf]);
  const facMeta = useMemo(() => facilityMeta(data), [data]);
  // per-facility market context: how many networks sit there, and its rank in its metro
  const facStats = useMemo(() => {
    const byMetro = new Map<string, Array<{ facilityId: number; networkCount: number }>>();
    for (const f of facilitiesRanking(data, derived.latest)) {
      const a = byMetro.get(f.metro);
      if (a) a.push(f);
      else byMetro.set(f.metro, [f]);
    }
    const m = new Map<number, { networkCount: number; rank: number; metroCount: number }>();
    byMetro.forEach((list) => {
      const sorted = [...list].sort((a, b) => b.networkCount - a.networkCount);
      sorted.forEach((f, i) => m.set(f.facilityId, { networkCount: f.networkCount, rank: i + 1, metroCount: sorted.length }));
    });
    return m;
  }, [data, derived.latest]);
  const [watched, setWatched] = useState<boolean>(() => loadWatchlist().includes(Number(asn)));

  // footprint honours the global scope; fall back to full footprint if the
  // network is absent from every scoped metro
  const inScopeFootprint = scope && scope.length ? p.footprint.filter((f) => scope.includes(f.metro)) : p.footprint;
  const scopeMismatch = Boolean(scope && scope.length && inScopeFootprint.length === 0);
  const visibleFootprint = inScopeFootprint.length ? inScopeFootprint : p.footprint;

  /* ---- comparator networks for the data-centre matrix (URL-backed) ---- */
  const [searchParams, setSearchParams] = useSearchParams();
  const withAsns = useMemo(
    () =>
      (searchParams.get("with") || "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0 && n !== Number(asn)),
    [searchParams, asn]
  );
  const compareAsns = useMemo(() => Array.from(new Set([Number(asn), ...withAsns])).slice(0, 8), [asn, withAsns]);
  const compareProfiles = useMemo(
    () => compareAsns.map((a) => networkProfile(data, a, asOf)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, compareAsns.join(","), asOf]
  );
  const setWith = (list: number[]) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const v = Array.from(new Set(list)).filter((x) => x !== Number(asn) && x > 0).slice(0, 7);
        if (v.length) next.set("with", v.join(","));
        else next.delete("with");
        return next;
      },
      { replace: true }
    );
  const dir = useMemo(() => networksDirectory(data, derived.latest), [data, derived.latest]);

  // live facility membership (netfac), one entry per compared network
  const [facMap, setFacMap] = useState<Record<number, { loading: boolean; rows: FacRow[]; error: string | null }>>({});

  // live PeeringDB net record — peering policy, traffic band, scope, website
  const [netInfo, setNetInfo] = useState<{ policy?: string; traffic?: string; scope?: string; website?: string } | null>(null);
  useEffect(() => {
    if (!p.found || !p.netId) return;
    let alive = true;
    setNetInfo(null);
    fetchPeeringDb<any>("net", { id: p.netId })
      .then((resp) => {
        if (!alive) return;
        const r = resp.data?.[0];
        if (r)
          setNetInfo({
            policy: r.policy_general || undefined,
            traffic: r.info_traffic || undefined,
            scope: r.info_scope || undefined,
            website: r.website || undefined,
          });
      })
      .catch(() => alive && setNetInfo(null));
    return () => {
      alive = false;
    };
  }, [p]);

  useEffect(() => {
    let alive = true;
    compareProfiles.forEach((pr) => {
      if (!pr.found || !pr.netId || facMap[pr.asn]) return;
      setFacMap((m) => ({ ...m, [pr.asn]: { loading: true, rows: [], error: null } }));
      fetchPeeringDb<any>("netfac", { net_id: pr.netId, all: 1 })
        .then((resp) => {
          if (!alive) return;
          const rows: FacRow[] = (resp.data || []).map((r: any) => {
            const meta = facMeta.get(r.fac_id);
            return {
              facId: r.fac_id,
              name: meta?.name || r.name,
              org: meta?.org || "—",
              metro: meta?.metro || null,
              isEquinix: meta?.isEquinix ?? /equinix/i.test(r.name || ""),
              city: r.city || "",
              country: r.country || "",
            };
          });
          setFacMap((m) => ({ ...m, [pr.asn]: { loading: false, rows, error: null } }));
        })
        .catch((e) => alive && setFacMap((m) => ({ ...m, [pr.asn]: { loading: false, rows: [], error: e?.message || "Fetch failed" } })));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareProfiles, facMeta]);

  const toggleWatch = () => {
    const list = loadWatchlist();
    const n = Number(asn);
    const next = list.includes(n) ? list.filter((x) => x !== n) : [...list, n];
    saveWatchlist(next);
    setWatched(next.includes(n));
  };

  // one block per visible metro — bar segments + facility chips
  const blocks = useMemo(
    () =>
      visibleFootprint.map((f) => {
        const ports = p.ports.filter((x) => x.metro === f.metro).sort((a, b) => b.capG - a.capG);
        const totalG = ports.reduce((a, x) => a + x.capG, 0);
        const top = ports.slice(0, 5);
        const rest = ports.slice(5);
        const segments = top.map((x, i) => ({
          label: x.ixName,
          capG: x.capG,
          color: segColor(x, i),
          ixId: x.ixId,
          eqx: x.isEquinix,
        }));
        if (rest.length)
          segments.push({
            label: `${rest.length} more`,
            capG: rest.reduce((a, x) => a + x.capG, 0),
            color: "#5b6b7d",
            ixId: -1,
            eqx: false,
          });
        return { f, totalG, segments };
      }),
    [visibleFootprint, p.ports]
  );
  const totalScopedG = blocks.reduce((a, b) => a + b.totalG, 0);

  if (!p.found) {
    return (
      <div className="rd-center">
        <h3>Network not in snapshots</h3>
        <p>AS{asn} has no presence in the stored APAC snapshots. It may operate outside APAC or not be listed.</p>
        <button className="rd-btn" onClick={() => navigate(-1)}>
          Go back
        </button>
      </div>
    );
  }

  const latest = p.snapshots[p.snapshots.length - 1];
  const prev = p.snapshots.length > 1 ? p.snapshots[p.snapshots.length - 2] : latest;
  const maxMetro = visibleFootprint[0]?.capT || 1;

  // this network's own facility presence, limited to the metros in scope
  const primaryFacs = facMap[p.asn] || { loading: true, rows: [], error: null };
  const scopedFacRows = primaryFacs.rows.filter((x) => x.metro && visibleFootprint.some((f) => f.metro === x.metro));
  const eqxDcCount = scopedFacRows.filter((x) => x.isEquinix).length;
  const compDcCount = scopedFacRows.length - eqxDcCount;

  // comparing more than just this network? both sections switch to matrix form
  const multi = compareAsns.length > 1;
  // exchanges in a metro where at least one compared network has a port
  const ixColsForMetro = (metro: string) => {
    const agg = new Map<number, { ixId: number; name: string; eqx: boolean; total: number }>();
    compareProfiles.forEach((pr) =>
      pr.ports
        .filter((x) => x.metro === metro)
        .forEach((x) => {
          const e = agg.get(x.ixId) || { ixId: x.ixId, name: x.ixName, eqx: x.isEquinix, total: 0 };
          e.total += x.capG;
          agg.set(x.ixId, e);
        })
    );
    return Array.from(agg.values())
      .sort((a, b) => (a.eqx !== b.eqx ? (a.eqx ? -1 : 1) : b.total - a.total))
      .slice(0, 8);
  };

  // matrix helpers: is a network in a facility, and which DCs to show per metro
  const isIn = (a: number, facId: number) => (facMap[a]?.rows || []).some((x) => x.facId === facId);
  const anyLoading = compareProfiles.some((pr) => pr.found && pr.netId && (!facMap[pr.asn] || facMap[pr.asn]?.loading));
  const colsForMetro = (metro: string) => {
    const seen = new Map<number, FacRow>();
    compareProfiles.forEach((pr) => (facMap[pr.asn]?.rows || []).forEach((x) => x.metro === metro && seen.set(x.facId, x)));
    return Array.from(seen.values()).sort(
      (a, b) =>
        Number(b.isEquinix) - Number(a.isEquinix) ||
        (facStats.get(b.facId)?.networkCount || 0) - (facStats.get(a.facId)?.networkCount || 0)
    );
  };

  const compareTo = (() => {
    const n = new URLSearchParams(search);
    n.set("nets", String(p.asn));
    return { pathname: "/compare", search: `?${n.toString()}` };
  })();

  return (
    <>
      <Link className="rd-crumb" to={{ pathname: "/networks", search }}>
        ← Networks
      </Link>

      <div className="rd-xhead">
        <h1>{p.name}</h1>
        <span className="rd-cc" style={{ fontSize: 11, padding: "3px 8px" }}>
          AS{p.asn}
        </span>
        <span className="rd-cc" style={{ fontSize: 11, padding: "3px 8px" }}>
          {p.type}
        </span>
        {netInfo?.policy ? (
          <span className={`rd-polchip ${netInfo.policy.toLowerCase()}`} title="PeeringDB peering policy (live)">
            {netInfo.policy} policy
          </span>
        ) : null}
        {netInfo?.traffic ? (
          <span className="rd-cc" style={{ fontSize: 11, padding: "3px 8px" }} title="Self-declared traffic band (live)">
            ~{netInfo.traffic}
          </span>
        ) : null}
        {netInfo?.scope ? (
          <span className="rd-cc" style={{ fontSize: 11, padding: "3px 8px" }} title="Geographic scope (live)">
            {netInfo.scope}
          </span>
        ) : null}
        {netInfo?.website ? (
          <a className="rd-cc rd-weblink" style={{ fontSize: 11, padding: "3px 8px" }} href={netInfo.website} target="_blank" rel="noreferrer">
            {netInfo.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} ↗
          </a>
        ) : null}
        <div className="rd-grow" />
        <Link className="rd-btn" to={compareTo}>
          ⇄ Analyse
        </Link>
        <button className={`rd-btn${watched ? " on" : ""}`} onClick={toggleWatch}>
          {watched ? "★ On watchlist" : "☆ Add to watchlist"}
        </button>
      </div>

      <div className="rd-kpis four">
        <Kpi label="APAC capacity" value={p.totalCapT.toFixed(1)} unit="Tbps" delta={Number(p.dCapT.toFixed(1))} deltaUnit=" T" vs={fmtMonth(prev)} spark={p.capSeries} />
        <Kpi label="Metros present" value={String(p.metroCount)} deltaNode={<span className="rd-flat">in APAC</span>} />
        <Kpi label="Exchange ports" value={String(p.ixCount)} deltaNode={<span className="rd-flat">across all metros</span>} />
        <Kpi label="Facility presences" value={String(p.facCount)} deltaNode={<span className="rd-flat">DC footprint</span>} />
      </div>

      <div className="rd-section">
        <div className="rd-split">
          <Panel
            title="Footprint by metro"
            tag={scope && scope.length && !scopeMismatch ? `${visibleFootprint.length} of ${p.footprint.length} · scope` : `${visibleFootprint.length} metros`}
          >
            {scopeMismatch ? (
              <div style={{ padding: "8px 11px", color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>
                {p.name} has no presence in your selected metros — showing its full APAC footprint.
              </div>
            ) : null}
            {visibleFootprint.map((f) => (
              <button
                type="button"
                key={f.metro}
                className="rd-shrow rd-metrorow"
                style={{ gridTemplateColumns: "150px 1fr 70px 84px" }}
                onClick={() => document.getElementById(`mb-${f.metro}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
              >
                <span className="nm">
                  {f.metro} <span className="rd-cc">{METRO_CODES[f.metro] || f.country}</span>
                </span>
                <Bar pct={(f.capT / maxMetro) * 100} />
                <span className="pv rd-num">{f.capT.toFixed(1)}T</span>
                <span className="fr rd-num">
                  {f.ixCount} IX · {f.facCount} DC
                </span>
              </button>
            ))}
          </Panel>
          <Panel title={`Port movement · ${fmtMonth(latest)}`} tag={`+${p.joined.length} · −${p.left.length} · ↑${p.upgraded.length}`}>
            <div className="rd-eyebrow" style={{ padding: "6px 11px 2px" }}>
              Joined
            </div>
            {p.joined.length ? p.joined.slice(0, 3).map((x) => portMini(x, search)) : empty("No new ports.")}
            <div className="rd-eyebrow" style={{ padding: "10px 11px 2px" }}>
              Upgraded
            </div>
            {p.upgraded.length ? p.upgraded.slice(0, 3).map((x) => portMini(x, search)) : empty("No ≥100G upgrades.")}
            {p.left.length ? (
              <>
                <div className="rd-eyebrow" style={{ padding: "10px 11px 2px" }}>
                  Left
                </div>
                {p.left.slice(0, 2).map((x) => portMini(x, search))}
              </>
            ) : null}
          </Panel>
        </div>
      </div>

      {/* comparator picker — drives BOTH the exchange and data-centre sections */}
      <div className="rd-slider-bar" style={{ alignItems: "flex-start", gap: 14 }}>
        <div style={{ minWidth: 260, flex: 1, maxWidth: 420 }}>
          <NetworkTypeahead
            options={dir}
            onPick={(a) => setWith([...withAsns, a])}
            onPickMany={(list) => setWith([...withAsns, ...list])}
            exclude={new Set(compareAsns)}
            placeholder="Compare with — names or ASNs…"
          />
          {withAsns.length ? (
            <div className="rd-chips" style={{ marginTop: 8, marginBottom: 0 }}>
              {withAsns.map((a) => {
                const nm = compareProfiles.find((x) => x.asn === a)?.name || `AS${a}`;
                return (
                  <button key={a} className="rd-chip on" onClick={() => setWith(withAsns.filter((x) => x !== a))} title="Remove">
                    {nm.length > 18 ? `${nm.slice(0, 17)}…` : nm} ✕
                  </button>
                );
              })}
              <button className="rd-chip" onClick={() => setWith([])}>
                clear ✕
              </button>
            </div>
          ) : null}
        </div>
        <div className="rd-grow" />
        <span className="note rd-num">
          {compareAsns.length === 1
            ? `${p.name} only — add networks to compare exchanges and data centres side by side`
            : `${compareAsns.length} networks compared · exchanges and data centres below`}
        </span>
      </div>

      <div className="rd-sec-head">
        <h2>Exchange allocation — {scopeName}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="note rd-num">
            {multi
              ? `${visibleFootprint.length} metro${visibleFootprint.length === 1 ? "" : "s"} · cell = port capacity · share of that network's metro total`
              : `${blocks.length} metro${blocks.length === 1 ? "" : "s"} · ${
                  totalScopedG >= 1000 ? `${(totalScopedG / 1000).toFixed(1)} Tbps` : `${totalScopedG.toFixed(0)} Gbps`
                } deployed`}
          </span>
          <button
            className="rd-btn"
            onClick={() =>
              saveCsv(
                `allocation-${compareProfiles.map((x) => x.asn).join("-")}-${latest}.csv`,
                allocationCsvRows(compareProfiles, visibleFootprint.map((f) => f.metro), latest)
              )
            }
            title="One row per network × exchange, with each port's share of that network's metro capacity"
          >
            ↓ Allocation CSV
          </button>
        </div>
      </div>

      {/* multi-network: exchanges × networks matrix, mirroring the DC section */}
      {multi
        ? visibleFootprint.map((f) => {
            const cols = ixColsForMetro(f.metro);
            return (
              <div className="rd-metroblock" key={`ix-${f.metro}`}>
                <div className="rd-mb-head">
                  <Link className="name" to={{ pathname: `/metro/${encodeURIComponent(f.metro)}`, search }}>
                    {f.metro}
                  </Link>
                  <span className="rd-cc">{METRO_CODES[f.metro] || f.country || ""}</span>
                  {!cols.length ? <span className="rd-mb-note">no listed exchange ports here for these networks</span> : null}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="rd-amx compact">
                    <thead>
                      <tr>
                        <th className="who" />
                        {cols.length ? (
                          cols.map((c) => (
                            <th key={c.ixId} className={c.eqx ? "eqx" : ""}>
                              <Link to={{ pathname: `/exchange/${c.ixId}`, search }}>{c.name}</Link>
                            </th>
                          ))
                        ) : (
                          <th />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {compareProfiles.map((pr) => {
                        const mine = pr.ports.filter((x) => x.metro === f.metro);
                        const rowTotalG = mine.reduce((a, x) => a + x.capG, 0);
                        return (
                          <tr key={pr.asn}>
                            <td className="who">
                              <Link to={{ pathname: `/net/${pr.asn}`, search }} className="nm rd-netlink">
                                {pr.name.length > 20 ? `${pr.name.slice(0, 19)}…` : pr.name}
                              </Link>
                              <span className="sub rd-num">AS{pr.asn}</span>
                            </td>
                            {!cols.length || !rowTotalG ? (
                              <td className="cell facnote" colSpan={cols.length || 1}>
                                not present in this metro
                              </td>
                            ) : (
                              cols.map((c) => {
                                const g = mine.find((x) => x.ixId === c.ixId)?.capG || 0;
                                const pct = g > 0 ? (g / rowTotalG) * 100 : 0;
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
                                    title={g ? `${gLabel(g)} — ${pct.toFixed(0)}% of ${pr.name}'s ${f.metro} IX capacity` : undefined}
                                  >
                                    {g ? gLabel(g) : "—"}
                                    {g > 0 ? <span className="d shpct">{pct >= 0.5 ? `${pct.toFixed(0)}%` : "<1%"}</span> : null}
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        : blocks.map(({ f, totalG, segments }) => {
        return (
          <div className="rd-metroblock" key={f.metro} id={`mb-${f.metro}`}>
            <div className="rd-mb-head">
              <Link className="name" to={{ pathname: `/metro/${encodeURIComponent(f.metro)}`, search }}>
                {f.metro}
              </Link>
              <span className="rd-cc">{METRO_CODES[f.metro] || f.country || ""}</span>
              <span className="sub rd-num">
                {f.ixCount} IX · {f.facCount} DC
              </span>
              <span className="tot rd-num">{gLabel(totalG)}</span>
            </div>
            {segments.length ? (
              <>
                <div className="rd-stack">
                  {segments.map((s, i) => (
                    <div
                      key={i}
                      className="rd-stackseg"
                      style={{ width: `${(s.capG / (totalG || 1)) * 100}%`, background: s.color }}
                      {...bind(
                        <>
                          <div className="th">{s.label}</div>
                          <div className="tl">
                            <span>Capacity</span>
                            <b>{gLabel(s.capG)}</b>
                          </div>
                          <div className="tl">
                            <span>Share of {f.metro}</span>
                            <b>{((s.capG / (totalG || 1)) * 100).toFixed(0)}%</b>
                          </div>
                        </>
                      )}
                    >
                      {s.capG / (totalG || 1) > 0.14 ? gLabel(s.capG) : ""}
                    </div>
                  ))}
                </div>
                <div className="rd-stacklegend rd-mb-legend">
                  {segments.slice(0, 4).map((s, i) => {
                    const inner = (
                      <>
                        <span className="sw" style={{ background: s.color }} />
                        <span className="l">{s.label.length > 26 ? `${s.label.slice(0, 25)}…` : s.label}</span>
                        {s.eqx ? (
                          <span className="rd-tagx" style={{ padding: "1px 5px" }}>
                            EQX
                          </span>
                        ) : null}
                        <span className="v rd-num">
                          {gLabel(s.capG)} · {((s.capG / (totalG || 1)) * 100).toFixed(0)}%
                        </span>
                      </>
                    );
                    return s.ixId > 0 ? (
                      <Link key={i} className="rd-legrow" to={{ pathname: `/exchange/${s.ixId}`, search }}>
                        {inner}
                      </Link>
                    ) : (
                      <div key={i} className="rd-legrow">
                        {inner}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ color: "var(--muted)", fontSize: 12.5, padding: "4px 0" }}>
                No listed exchange ports in {f.metro} — facility-only presence.
              </div>
            )}
          </div>
        );
      })}

      {/* ---- data-centre presence: its own section, as a facilities × networks matrix ---- */}
      <div className="rd-sec-head" style={{ marginTop: 26 }}>
        <h2>Data-centre presence — {scopeName}</h2>
        <span className="note rd-num">
          {primaryFacs.loading ? (
            "fetching facilities…"
          ) : scopedFacRows.length ? (
            <span className="rd-dcsplit">
              {p.name}: {scopedFacRows.length} DC — <b style={{ color: "var(--equinix)" }}>{eqxDcCount} Equinix</b>
              {compDcCount ? <> · {compDcCount} competitor</> : null}
            </span>
          ) : (
            "no listed data centres in scope"
          )}
        </span>
      </div>

      {visibleFootprint.map((f) => {
        const cols = colsForMetro(f.metro);
        return (
          <div className="rd-metroblock" key={`dc-${f.metro}`}>
            <div className="rd-mb-head">
              <Link className="name" to={{ pathname: `/metro/${encodeURIComponent(f.metro)}`, search }}>
                {f.metro}
              </Link>
              <span className="rd-cc">{METRO_CODES[f.metro] || f.country || ""}</span>
              {!anyLoading && !cols.length ? (
                <span className="rd-mb-note">no listed data centres here for these networks</span>
              ) : null}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="rd-amx compact">
                <thead>
                  <tr>
                    <th className="who" />
                    {cols.length ? (
                      cols.map((c) => {
                        const st = facStats.get(c.facId);
                        return (
                          <th key={c.facId} className={`fac${c.isEquinix ? " eqx" : ""}`} title={`${c.name} · ${c.org}`}>
                            <Link to={{ pathname: `/fac/${c.facId}`, search }}>{c.name}</Link>
                            <span className="mx">
                              {c.isEquinix ? "Equinix" : c.org.length > 16 ? `${c.org.slice(0, 15)}…` : c.org}
                              {st ? ` · ${st.networkCount} · #${st.rank}` : ""}
                            </span>
                          </th>
                        );
                      })
                    ) : (
                      <th className="fac" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {compareProfiles.map((pr) => {
                    const loading = pr.found && pr.netId && (!facMap[pr.asn] || facMap[pr.asn]?.loading);
                    const here = cols.some((c) => isIn(pr.asn, c.facId));
                    return (
                      <tr key={pr.asn}>
                        <td className="who">
                          <Link to={{ pathname: `/net/${pr.asn}`, search }} className="nm rd-netlink">
                            {pr.name.length > 20 ? `${pr.name.slice(0, 19)}…` : pr.name}
                          </Link>
                          <span className="sub rd-num">AS{pr.asn}</span>
                        </td>
                        {loading ? (
                          (cols.length ? cols : [null]).map((c, i) => (
                            <td key={c ? c.facId : i} className="cell dot">
                              …
                            </td>
                          ))
                        ) : !cols.length || !here ? (
                          <td className="cell facnote" colSpan={cols.length || 1}>
                            not present in this metro
                          </td>
                        ) : (
                          cols.map((c) => {
                            const on = isIn(pr.asn, c.facId);
                            return (
                              <td key={c.facId} className={`cell dot${on ? (c.isEquinix ? " on eqx" : " on") : ""}`}>
                                {on ? "✓" : "·"}
                              </td>
                            );
                          })
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="rd-footnote">
        Snapshot-based ({fmtMonth(latest)}) for capacity and metros; which data centres each network sits in is fetched
        live from PeeringDB. Columns are the data centres in that metro where at least one compared network is present —
        Equinix violet, with operator, networks on site and metro rank under the name; rows are the networks. Add
        comparators above to line several networks up in the same facilities, and the selection lives in the URL so the
        comparison is shareable. Click a column header for the data-centre profile, an exchange in a legend for its
        profile, or a metro name for the metro view.
      </div>
      {tipNode}
    </>
  );
}

function portMini(port: NetworkPort, search: string) {
  return (
    <Link key={port.ixId} to={{ pathname: `/exchange/${port.ixId}`, search }} className="rd-rowlink">
      <div className="rd-mover">
        <span className="nm">
          {port.ixName}
          <span>{port.metro}</span>
        </span>
        <span className="mv rd-num" style={{ color: "var(--muted)" }}>
          {port.dCapG > 0 ? "+" : port.dCapG < 0 ? "−" : ""}
          {Math.abs(port.dCapG).toFixed(0)}G
        </span>
      </div>
    </Link>
  );
}

function empty(msg: string) {
  return <div style={{ padding: "14px 12px", color: "var(--muted)", fontSize: 12.5 }}>{msg}</div>;
}
