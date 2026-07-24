import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchPeeringDb } from "../peeringdbApi";
import { useSnapshot } from "./Shell";
import { Bar, Kpi, Panel, useTooltip } from "./bits";
import { METRO_CODES, NetworkPort, facilitiesRanking, facilityMeta, fmtMonth, loadWatchlist, networkProfile, saveWatchlist } from "./data";

/* Network deep dive. The allocation & presence section renders ONE block
   per scoped metro — stacked bar of that metro's IX allocation plus its
   facilities — all visible at once, no clicking. Markets are never blended.
   Clicking a footprint row just scrolls to that metro's block. */

// categorical palette for stacked-bar segments (reads on light and dark)
const SEG = ["#2BB0C4", "#4F86D6", "#3FB27F", "#E0A73C", "#D8617D", "#7C8AA0"];
const segColor = (port: NetworkPort, i: number) => (port.isEquinix ? "var(--equinix)" : SEG[i % SEG.length]);
// data-centre presence table: name · operator · metro · networks on site · rank
const FAC_GRID = "minmax(220px,1fr) 150px 130px 116px 108px";
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

  // live facility membership (netfac) for this network
  const [facs, setFacs] = useState<{ loading: boolean; rows: FacRow[]; error: string | null }>({
    loading: false,
    rows: [],
    error: null,
  });

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
    if (!p.found || !p.netId) return;
    let alive = true;
    setFacs({ loading: true, rows: [], error: null });
    fetchPeeringDb<any>("netfac", { net_id: p.netId, all: 1 })
      .then((resp) => {
        if (!alive) return;
        const rows: FacRow[] = resp.data.map((r: any) => {
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
        setFacs({ loading: false, rows, error: null });
      })
      .catch((e) => alive && setFacs({ loading: false, rows: [], error: e?.message || "Fetch failed" }));
    return () => {
      alive = false;
    };
  }, [p, facMeta]);

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

  // facility presence limited to the metros currently in scope — never blended
  const scopedFacRows = facs.rows.filter((x) => x.metro && visibleFootprint.some((f) => f.metro === x.metro));
  const eqxDcCount = scopedFacRows.filter((x) => x.isEquinix).length;
  const compDcCount = scopedFacRows.length - eqxDcCount;
  // table order: scoped-metro order, Equinix first within a metro, then busiest site
  const metroOrder = new Map(visibleFootprint.map((f, i) => [f.metro, i]));
  const facTable = [...scopedFacRows].sort(
    (a, b) =>
      (metroOrder.get(a.metro || "") ?? 99) - (metroOrder.get(b.metro || "") ?? 99) ||
      Number(b.isEquinix) - Number(a.isEquinix) ||
      (facStats.get(b.facId)?.networkCount || 0) - (facStats.get(a.facId)?.networkCount || 0)
  );
  const metrosWithoutDc = visibleFootprint
    .filter((f) => !scopedFacRows.some((x) => x.metro === f.metro))
    .map((f) => f.metro);

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

      <div className="rd-sec-head">
        <h2>Exchange allocation — {scopeName}</h2>
        <span className="note rd-num">
          {blocks.length} metro{blocks.length === 1 ? "" : "s"} ·{" "}
          {totalScopedG >= 1000 ? `${(totalScopedG / 1000).toFixed(1)} Tbps` : `${totalScopedG.toFixed(0)} Gbps`} deployed
        </span>
      </div>

      {blocks.map(({ f, totalG, segments }) => {
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

      {/* ---- data-centre presence: its own section, as a table ---- */}
      <div className="rd-sec-head" style={{ marginTop: 26 }}>
        <h2>Data-centre presence — {scopeName}</h2>
        <span className="note rd-num">
          {facs.loading ? (
            "fetching facilities…"
          ) : scopedFacRows.length ? (
            <span className="rd-dcsplit">
              {scopedFacRows.length} DC — <b style={{ color: "var(--equinix)" }}>{eqxDcCount} Equinix</b>
              {compDcCount ? <> · {compDcCount} competitor</> : null}
            </span>
          ) : (
            "no listed data centres in scope"
          )}
        </span>
      </div>
      <Panel title={`Where ${p.name} is racked`} tag={fmtMonth(latest)}>
        <div className="rd-dirhead" style={{ gridTemplateColumns: FAC_GRID }}>
          <span>Data centre</span>
          <span>Operator</span>
          <span>Metro</span>
          <span className="c">Networks on site</span>
          <span className="c">Rank in metro</span>
        </div>
        {facs.loading ? (
          <div style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 13 }}>Loading data-centre presence from PeeringDB…</div>
        ) : facs.error ? (
          <div style={{ padding: "16px 12px", color: "var(--gap)", fontSize: 13 }}>Couldn't load facilities: {facs.error}</div>
        ) : facTable.length ? (
          facTable.map((x) => {
            const st = facStats.get(x.facId);
            return (
              <Link key={x.facId} to={{ pathname: `/fac/${x.facId}`, search }} className="rd-rowlink">
                <div className={`rd-dirrow facts${x.isEquinix ? " eqxrow" : ""}`} style={{ gridTemplateColumns: FAC_GRID }}>
                  <span className="nm" style={x.isEquinix ? { color: "var(--equinix)" } : undefined} title={x.name}>
                    {x.name.length > 34 ? `${x.name.slice(0, 33)}…` : x.name}
                  </span>
                  <span className="meta" title={x.org}>
                    {x.isEquinix ? "Equinix" : x.org.length > 20 ? `${x.org.slice(0, 19)}…` : x.org}
                  </span>
                  <span className="meta">
                    {x.metro} <span className="rd-cc">{METRO_CODES[x.metro || ""] || ""}</span>
                  </span>
                  <span className="pv rd-num">{st ? st.networkCount.toLocaleString() : "—"}</span>
                  <span className="meta rd-num">{st ? `#${st.rank} of ${st.metroCount}` : "—"}</span>
                </div>
              </Link>
            );
          })
        ) : (
          <div style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 13 }}>
            {p.name} lists no data centres in {scopeName}.
          </div>
        )}
        {!facs.loading && metrosWithoutDc.length ? (
          <div style={{ padding: "10px 12px", color: "var(--faint)", fontSize: 12 }}>
            No listed data centres in {metrosWithoutDc.join(", ")} — exchange-only presence there.
          </div>
        ) : null}
      </Panel>

      <div className="rd-footnote">
        Snapshot-based ({fmtMonth(latest)}) for capacity, metros and the data-centre columns; which facilities this
        network sits in is fetched live from PeeringDB. Every scoped metro renders at once — change the metro scope above
        and both sections follow. The Equinix / competitor split is the displacement view: competitor DCs in a metro where
        we also operate are the move-to-Equinix targets, and “networks on site” tells you how strategic each one is. Click
        a row for the data-centre profile, an exchange in a legend for its profile, or a metro name for the metro view.
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
