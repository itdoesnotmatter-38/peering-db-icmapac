import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Bar, Kpi, Panel } from "./bits";
import { METRO_CODES, NetworkPort, fmtMonth, loadWatchlist, networkProfile, saveWatchlist } from "./data";

/* Snapshot-based deep dive for one ASN — footprint across metros, every
   IX port with sizes, capacity trend, and its own port movement. Closes
   the metro <-> exchange <-> network triangle. */

export default function NetworkPage() {
  const { data } = useSnapshot();
  const { asn } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();

  const p = useMemo(() => networkProfile(data, Number(asn)), [data, asn]);
  const [watched, setWatched] = useState<boolean>(() => loadWatchlist().includes(Number(asn)));

  const toggleWatch = () => {
    const list = loadWatchlist();
    const n = Number(asn);
    const next = list.includes(n) ? list.filter((x) => x !== n) : [...list, n];
    saveWatchlist(next);
    setWatched(next.includes(n));
  };

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
  const maxPort = p.ports[0]?.capG || 1;

  const portRow = (port: NetworkPort, showDelta = false) => (
    <Link key={port.ixId} to={{ pathname: `/exchange/${port.ixId}`, search }} className="rd-rowlink">
      <div className={`rd-shrow${port.isEquinix ? " eqxrow" : ""}`} style={{ gridTemplateColumns: "1fr 120px 78px 70px" }}>
        <span className="nm" style={port.isEquinix ? { color: "var(--equinix)" } : undefined}>
          {port.ixName.length > 26 ? `${port.ixName.slice(0, 25)}…` : port.ixName}
          <span className="rd-cc" style={{ marginLeft: 7 }}>
            {port.metro}
          </span>
        </span>
        <Bar pct={(port.capG / maxPort) * 100} color={port.isEquinix ? "var(--equinix)" : "var(--accent)"} />
        <span className="pv rd-num">{port.capG >= 1000 ? `${(port.capG / 1000).toFixed(1)}T` : `${port.capG.toFixed(0)}G`}</span>
        <span className={`fr rd-num ${port.dCapG > 0 ? "rd-up" : port.dCapG < 0 ? "rd-down" : ""}`} style={{ textAlign: "right" }}>
          {showDelta || port.dCapG !== 0 ? `${port.dCapG > 0 ? "+" : port.dCapG < 0 ? "−" : ""}${Math.abs(port.dCapG).toFixed(0)}G` : "—"}
        </span>
      </div>
    </Link>
  );

  return (
    <>
      <Link className="rd-crumb" to={{ pathname: "/movement", search }}>
        ← Movement
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
          <Panel title="Footprint by metro" tag={fmtMonth(latest)}>
            {p.footprint.map((f) => (
              <div className="rd-shrow" key={f.metro} style={{ gridTemplateColumns: "150px 1fr 70px 84px" }}>
                <span className="nm">
                  {f.metro} <span className="rd-cc">{METRO_CODES[f.metro] || f.country}</span>
                </span>
                <Bar pct={(f.capT / maxMetro) * 100} />
                <span className="pv rd-num">{f.capT.toFixed(1)}T</span>
                <span className="fr rd-num">
                  {f.ixCount} IX · {f.facCount} DC
                </span>
              </div>
            ))}
          </Panel>
          <Panel title={`Port movement · ${fmtMonth(latest)}`} tag={`+${p.joined.length} · −${p.left.length} · ↑${p.upgraded.length}`}>
            <div className="rd-eyebrow" style={{ padding: "6px 11px 2px" }}>
              Joined
            </div>
            {p.joined.length ? p.joined.slice(0, 4).map((x) => portRow(x, true)) : <div style={{ padding: "8px 11px", color: "var(--muted)", fontSize: 12.5 }}>No new ports.</div>}
            <div className="rd-eyebrow" style={{ padding: "10px 11px 2px" }}>
              Upgraded
            </div>
            {p.upgraded.length ? p.upgraded.slice(0, 4).map((x) => portRow(x, true)) : <div style={{ padding: "8px 11px", color: "var(--muted)", fontSize: 12.5 }}>No ≥100G upgrades.</div>}
            {p.left.length ? (
              <>
                <div className="rd-eyebrow" style={{ padding: "10px 11px 2px" }}>
                  Left
                </div>
                {p.left.slice(0, 3).map((x) => portRow(x, true))}
              </>
            ) : null}
          </Panel>
        </div>
      </div>

      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>All exchange ports</h2>
          <span className="note">Every IX this network peers at, by port capacity · click for the exchange profile</span>
        </div>
        <Panel title={`${p.ports.length} ports`} tag={fmtMonth(latest)}>
          {p.ports.map((port) => portRow(port))}
        </Panel>
        <div className="rd-footnote">
          Snapshot-based ({fmtMonth(latest)}). Port sizes and facility counts are PeeringDB self-reported. Facility-level
          detail (which specific data centres) will appear here once raw netfac snapshot files are wired in.
        </div>
      </div>
    </>
  );
}
