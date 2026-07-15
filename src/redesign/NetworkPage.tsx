import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchPeeringDb } from "../peeringdbApi";
import { useSnapshot } from "./Shell";
import { Bar, Kpi, Panel, useTooltip } from "./bits";
import { METRO_CODES, NetworkPort, facilityMeta, fmtMonth, loadWatchlist, networkProfile, saveWatchlist } from "./data";

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
  const { data, scope, scopeName, asOf } = useSnapshot();
  const { asn } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const { bind, node: tipNode } = useTooltip();

  const p = useMemo(() => networkProfile(data, Number(asn), asOf), [data, asn, asOf]);
  const facMeta = useMemo(() => facilityMeta(data), [data]);
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
        <div className="rd-grow" />
        <Link className="rd-btn" to={compareTo}>
          ⇄ Compare
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
        <h2>Allocation &amp; presence — {scopeName}</h2>
        <span className="note rd-num">
          {blocks.length} metro{blocks.length === 1 ? "" : "s"} ·{" "}
          {totalScopedG >= 1000 ? `${(totalScopedG / 1000).toFixed(1)} Tbps` : `${totalScopedG.toFixed(0)} Gbps`} deployed
          {facs.loading ? " · fetching facilities…" : ""}
        </span>
      </div>

      {blocks.map(({ f, totalG, segments }) => {
        const metroFacs = facs.rows
          .filter((x) => x.metro === f.metro)
          .sort((a, b) => Number(b.isEquinix) - Number(a.isEquinix));
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
            {metroFacs.length ? (
              <div className="rd-facchips">
                {metroFacs.map((x) => (
                  <span key={x.facId} className={`rd-facchip${x.isEquinix ? " eqx" : ""}`} title={`${x.name} · ${x.org}`}>
                    {x.name.length > 32 ? `${x.name.slice(0, 31)}…` : x.name}
                  </span>
                ))}
              </div>
            ) : !facs.loading && !facs.error ? (
              <div className="rd-facchips">
                <span className="rd-facchip" style={{ opacity: 0.7 }}>
                  no listed facilities
                </span>
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="rd-footnote">
        Snapshot-based ({fmtMonth(latest)}) for capacity and metros; facility presence is fetched live from PeeringDB.
        Every scoped metro renders at once — change the metro scope above and this section follows. Click an exchange in
        a legend for its profile, or a metro name for the metro view.
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
