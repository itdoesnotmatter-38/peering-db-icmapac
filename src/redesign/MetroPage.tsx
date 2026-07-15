import React, { useMemo } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Bar, Kpi, Panel } from "./bits";
import { METRO_CODES, fmtMonth, metroProfile } from "./data";

/* Metro profile — the one primary dimension that lacked a home. Everything
   about one metro: exchanges, facilities, top networks, Equinix share, and
   capacity trend. Ties the metro <-> exchange <-> network <-> facility web
   together. Always shows the whole metro regardless of the global scope. */

export default function MetroPage() {
  const { data } = useSnapshot();
  const { name } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();

  const p = useMemo(() => metroProfile(data, name || ""), [data, name]);

  if (!p.found) {
    return (
      <div className="rd-center">
        <h3>Metro not found</h3>
        <p>No snapshot data for “{name}”.</p>
        <button className="rd-btn" onClick={() => navigate({ pathname: "/", search })}>
          Back to Overview
        </button>
      </div>
    );
  }

  const latest = p.snapshots[p.snapshots.length - 1];
  const prev = p.snapshots.length > 1 ? p.snapshots[p.snapshots.length - 2] : latest;
  const maxEx = p.exchanges[0]?.capT || 1;
  const maxFac = p.facilities[0]?.networkCount || 1;
  const maxNet = p.topNetworks[0]?.capT || 1;

  return (
    <>
      <Link className="rd-crumb" to={{ pathname: "/", search }}>
        ← Overview
      </Link>

      <div className="rd-xhead">
        <h1>{p.metro}</h1>
        <span className="rd-cc" style={{ fontSize: 11, padding: "3px 8px" }}>
          {METRO_CODES[p.metro] || p.country}
        </span>
        <span className="rd-cc" style={{ fontSize: 11, padding: "3px 8px" }}>
          #{p.rankInApac} of {p.apacMetroCount} in APAC
        </span>
      </div>

      <div className="rd-kpis">
        <Kpi label="Deployed capacity" value={p.capT.toFixed(1)} unit="Tbps" delta={Number(p.dCapT.toFixed(1))} deltaUnit=" T" vs={fmtMonth(prev)} spark={p.capSeries} />
        <Kpi label="Networks" value={p.nets.toLocaleString()} delta={p.dNets} vs={fmtMonth(prev)} />
        <Kpi label="Exchanges" value={String(p.ixCount)} deltaNode={<span className="rd-flat">in this metro</span>} />
        <Kpi label="Facilities" value={String(p.facCount)} deltaNode={<span className="rd-flat">data centres</span>} />
        <Kpi
          label="Equinix IX share"
          value={p.equinixSharePct.toFixed(1)}
          unit="%"
          deltaNode={<span className="rd-flat">of IX capacity</span>}
        />
      </div>

      <div className="rd-section">
        <div className="rd-split">
          <Panel title="Exchanges in this metro" tag={fmtMonth(latest)}>
            {p.exchanges.map((x) => (
              <Link key={x.ixId} to={{ pathname: `/exchange/${x.ixId}`, search }} className="rd-rowlink">
                <div className={`rd-shrow${x.isEquinix ? " eqxrow" : ""}`} style={{ gridTemplateColumns: "180px 1fr 70px 66px" }}>
                  <span className="nm" style={x.isEquinix ? { color: "var(--equinix)" } : undefined}>
                    {x.name.length > 22 ? `${x.name.slice(0, 21)}…` : x.name}
                  </span>
                  <Bar pct={(x.capT / maxEx) * 100} color={x.isEquinix ? "var(--equinix)" : "var(--accent)"} />
                  <span className="pv rd-num">{x.capT.toFixed(1)}T</span>
                  <span className="fr rd-num">{x.nets} nets</span>
                </div>
              </Link>
            ))}
          </Panel>
          <Panel title="Facilities in this metro" tag={fmtMonth(latest)}>
            {p.facilities.slice(0, 12).map((f) => (
              <div className={`rd-shrow${f.isEquinix ? " eqxrow" : ""}`} key={f.facilityId} style={{ gridTemplateColumns: "1fr 1fr 44px" }}>
                <span className="nm" style={f.isEquinix ? { color: "var(--equinix)" } : undefined} title={f.name}>
                  {f.name.length > 24 ? `${f.name.slice(0, 23)}…` : f.name}
                </span>
                <Bar pct={(f.networkCount / maxFac) * 100} color={f.isEquinix ? "var(--equinix)" : "var(--border-strong)"} />
                <span className="pv rd-num">{f.networkCount}</span>
              </div>
            ))}
          </Panel>
        </div>
      </div>

      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>Top networks in {p.metro}</h2>
          <span className="note">By deployed capacity · click for the network profile</span>
        </div>
        <Panel title={`Top ${p.topNetworks.length} of ${p.nets.toLocaleString()} networks`} tag={fmtMonth(latest)}>
          {p.topNetworks.map((n, i) => (
            <Link key={n.asn} to={{ pathname: `/net/${n.asn}`, search }} className="rd-rowlink">
              <div className="rd-dirrow">
                <span className="rk rd-num">{i + 1}</span>
                <span className="nm">
                  {n.name}
                  <span className="rd-cc" style={{ marginLeft: 7 }}>
                    AS{n.asn}
                  </span>
                  <span className="ty">{n.type}</span>
                </span>
                <Bar pct={(n.capT / maxNet) * 100} />
                <span className="pv rd-num">{n.capT.toFixed(1)}T</span>
                <span className="meta rd-num" />
              </div>
            </Link>
          ))}
        </Panel>
      </div>

      <div className="rd-footnote">
        Snapshot-based ({fmtMonth(latest)}). Equinix IX share is capacity on Equinix-named exchanges as a share of all
        listed IX capacity in {p.metro}. Use Live explore for this metro's ports as they stand today.
      </div>
    </>
  );
}
