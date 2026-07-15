import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchPeeringDb } from "../peeringdbApi";
import { useSnapshot } from "./Shell";
import { Bar, Kpi, Panel, useTooltip } from "./bits";
import { METRO_CODES, NetworkPort, facilityMeta, fmtMonth, loadWatchlist, networkProfile, saveWatchlist } from "./data";

/* Network deep dive. Click a metro in the footprint to drill in: the
   capacity-allocation stacked bar and the facility presence below both
   follow the selected metro. Facility membership is fetched live from
   PeeringDB (netfac) and labelled from the snapshot. */

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
  const { data } = useSnapshot();
  const { asn } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const { bind, node: tipNode } = useTooltip();

  const p = useMemo(() => networkProfile(data, Number(asn)), [data, asn]);
  const facMeta = useMemo(() => facilityMeta(data), [data]);
  const [watched, setWatched] = useState<boolean>(() => loadWatchlist().includes(Number(asn)));
  const [metro, setMetro] = useState<string>(p.footprint[0]?.metro || "");

  // live facility membership (netfac) for this network
  const [facs, setFacs] = useState<{ loading: boolean; rows: FacRow[]; error: string | null }>({
    loading: false,
    rows: [],
    error: null,
  });

  useEffect(() => {
    setMetro(p.footprint[0]?.metro || "");
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

  // ports in the selected metro → stacked-bar segments (top 6 + "other")
  const metroPorts = useMemo(() => p.ports.filter((x) => x.metro === metro), [p.ports, metro]);
  const metroTotalG = metroPorts.reduce((a, x) => a + x.capG, 0);
  const segments = useMemo(() => {
    const top = metroPorts.slice(0, 6);
    const rest = metroPorts.slice(6);
    const out = top.map((x, i) => ({ label: x.ixName, capG: x.capG, color: segColor(x, i), ixId: x.ixId, eqx: x.isEquinix }));
    if (rest.length) out.push({ label: `${rest.length} more`, capG: rest.reduce((a, x) => a + x.capG, 0), color: "#5b6b7d", ixId: -1, eqx: false });
    return out;
  }, [metroPorts]);

  const metroFacs = useMemo(() => facs.rows.filter((f) => f.metro === metro).sort((a, b) => Number(b.isEquinix) - Number(a.isEquinix)), [facs.rows, metro]);

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
  const maxMetro = p.footprint[0]?.capT || 1;

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
          <Panel title="Footprint by metro" tag="click to drill in">
            {p.footprint.map((f) => (
              <button
                type="button"
                key={f.metro}
                className={`rd-shrow rd-metrorow${f.metro === metro ? " sel" : ""}`}
                style={{ gridTemplateColumns: "150px 1fr 70px 84px" }}
                onClick={() => setMetro(f.metro)}
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
        <h2>{metro || "—"} — allocation &amp; presence</h2>
        <span className="note rd-num">
          {metroPorts.length} exchanges · {metroTotalG >= 1000 ? `${(metroTotalG / 1000).toFixed(1)} Tbps` : `${metroTotalG.toFixed(0)} Gbps`} deployed
        </span>
      </div>
      <div className="rd-split">
        <Panel title={`Capacity allocation across ${metro || "metro"} exchanges`}>
          {segments.length ? (
            <div style={{ padding: "12px 14px 6px" }}>
              <div className="rd-stack">
                {segments.map((s, i) => (
                  <div
                    key={i}
                    className="rd-stackseg"
                    style={{ width: `${(s.capG / (metroTotalG || 1)) * 100}%`, background: s.color }}
                    {...bind(
                      <>
                        <div className="th">{s.label}</div>
                        <div className="tl">
                          <span>Capacity</span>
                          <b>{gLabel(s.capG)}</b>
                        </div>
                        <div className="tl">
                          <span>Share</span>
                          <b>{((s.capG / (metroTotalG || 1)) * 100).toFixed(0)}%</b>
                        </div>
                      </>
                    )}
                  >
                    {(s.capG / (metroTotalG || 1)) > 0.12 ? gLabel(s.capG) : ""}
                  </div>
                ))}
              </div>
              <div className="rd-stacklegend">
                {segments.map((s, i) => {
                  const inner = (
                    <>
                      <span className="sw" style={{ background: s.color }} />
                      <span className="l">{s.label.length > 24 ? `${s.label.slice(0, 23)}…` : s.label}</span>
                      {s.eqx ? <span className="rd-tagx" style={{ padding: "1px 5px" }}>EQX</span> : null}
                      <span className="v rd-num">
                        {gLabel(s.capG)} · {((s.capG / (metroTotalG || 1)) * 100).toFixed(0)}%
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
            </div>
          ) : (
            empty(`${p.name} has no listed exchange ports in ${metro}.`)
          )}
        </Panel>

        <Panel
          title={`Facilities in ${metro || "metro"}`}
          tag={facs.loading ? "loading…" : `${metroFacs.length} present`}
        >
          {facs.loading ? (
            <div style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 12.5, display: "flex", alignItems: "center", gap: 10 }}>
              <span className="rd-spinner" style={{ width: 16, height: 16, borderWidth: 2, margin: 0 }} /> Fetching live facility presence…
            </div>
          ) : facs.error ? (
            empty(`Couldn't load facilities: ${facs.error}`)
          ) : metroFacs.length ? (
            metroFacs.map((f) => (
              <div className={`rd-shrow${f.isEquinix ? " eqxrow" : ""}`} key={f.facId} style={{ gridTemplateColumns: "1fr auto" }}>
                <span className="nm" style={f.isEquinix ? { color: "var(--equinix)" } : undefined} title={f.name}>
                  {f.name.length > 34 ? `${f.name.slice(0, 33)}…` : f.name}
                </span>
                <span className="fr rd-num" title={f.org}>
                  {f.org.length > 20 ? `${f.org.slice(0, 19)}…` : f.org}
                </span>
              </div>
            ))
          ) : (
            empty(`${p.name} lists no facilities in ${metro}.`)
          )}
        </Panel>
      </div>

      <div className="rd-footnote">
        Snapshot-based ({fmtMonth(latest)}) for capacity and metros; facility presence is fetched live from PeeringDB.
        Port sizes and facility memberships are self-reported. Click a metro above to change the allocation and facility
        views; click an exchange in the legend for its full profile.
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
