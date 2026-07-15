import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Panel } from "./bits";
import { fmtMonth, movementFor } from "./data";

export default function MovementPage() {
  const { scoped, derived } = useSnapshot();
  const { metros, latest, prev, upgrades } = derived;
  const { search } = useLocation();
  const [metro, setMetro] = useState(metros[0]?.metro || "Singapore");

  /* keep the focused metro valid when the global scope changes */
  useEffect(() => {
    if (!metros.some((m) => m.metro === metro) && metros.length) setMetro(metros[0].metro);
  }, [metros, metro]);

  const mv = useMemo(() => movementFor(scoped, latest, prev, metro), [scoped, latest, prev, metro]);
  const wf = mv.waterfall;
  const wfMax = Math.max(wf.entrantsT, wf.upgradesT, Math.abs(wf.downgradesT), wf.departuresT, 0.001);

  const wfRow = (label: string, value: number, count: number, color: string) => (
    <div className="rd-wrow">
      <span className="l">
        {label} <span className="rd-num">({count})</span>
      </span>
      <span className="rd-bar">
        <i style={{ width: `${(Math.abs(value) / wfMax) * 100}%`, background: color }} />
      </span>
      <span className={`v rd-num ${value > 0 ? "rd-up" : value < 0 ? "rd-down" : "rd-flat"}`}>
        {value >= 0 ? "+" : "−"}
        {Math.abs(value).toFixed(2)} T
      </span>
    </div>
  );

  const list = (rows: typeof mv.entrants, empty: string) =>
    rows.length ? (
      rows.slice(0, 8).map((r) => (
        <div className="rd-mover" key={r.asn}>
          <span className="nm">
            {r.name}
            <span>
              AS{r.asn} · {r.type}
            </span>
          </span>
          <span className="mv rd-num" style={{ color: "var(--muted)" }}>
            {r.capT >= 0.05 ? `${r.capT.toFixed(1)} T` : "—"}
          </span>
        </div>
      ))
    ) : (
      <div style={{ padding: "12px 11px", color: "var(--muted)", fontSize: 12.5 }}>{empty}</div>
    );

  return (
    <>
      <div className="rd-chips">
        {metros.map((m) => (
          <button key={m.metro} className={`rd-chip${m.metro === metro ? " on" : ""}`} onClick={() => setMetro(m.metro)}>
            {m.metro}
          </button>
        ))}
      </div>

      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>
            {metro} — what changed in {fmtMonth(latest)}
          </h2>
          <span className="note rd-num">
            net capacity change {wf.netT >= 0 ? "+" : "−"}
            {Math.abs(wf.netT).toFixed(2)} Tbps
          </span>
        </div>
        <div className="rd-split">
          <Panel title="Capacity waterfall" tag={`${fmtMonth(prev)} → ${fmtMonth(latest)}`}>
            <div className="rd-wfall">
              {wfRow("Newly listed", wf.entrantsT, wf.entrantsN, "var(--present)")}
              {wfRow("Upgrades", wf.upgradesT, wf.upgradesN, "var(--accent)")}
              {wfRow("Downgrades", wf.downgradesT, wf.downgradesN, "var(--watch)")}
              {wfRow("Delisted", -wf.departuresT, wf.departuresN, "var(--gap)")}
            </div>
          </Panel>
          <Panel title="Why this reads 'listed', not 'deployed'">
            <div style={{ padding: "10px 11px", color: "var(--muted)", fontSize: 12.5, lineHeight: 1.6 }}>
              PeeringDB is self-reported. A "new" network is sometimes one that finally updated its record, and a
              delisting isn't always a physical exit. Treat this as the change in <b>visible</b> presence — it's still
              the right call list, just verify before quoting.
            </div>
          </Panel>
        </div>
      </div>

      <div className="rd-section">
        <div className="rd-split">
          <Panel title={`Newly listed in ${metro}`} tag={`+${mv.entrants.length}`}>
            {list(mv.entrants, "No new networks this month.")}
          </Panel>
          <Panel title={`Delisted from ${metro}`} tag={`−${mv.departures.length}`}>
            {list(mv.departures, "No departures this month.")}
          </Panel>
        </div>
      </div>

      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>Upgrade radar — region-wide</h2>
          <span className="note">Networks that added ≥100G on a single exchange since the last snapshot</span>
        </div>
        <Panel title={`${upgrades.length} upgrades ≥100G`} tag={fmtMonth(latest)}>
          {upgrades.slice(0, 15).map((u, i) => (
            <div className="rd-dumb" key={`${u.asn}-${u.ixName}-${i}`}>
              <span className="who">
                <span className="n">{u.name}</span>
                <span className="w rd-num">
                  AS{u.asn} ·{" "}
                  <Link to={{ pathname: `/exchange/${u.ixId}`, search }} style={{ color: "var(--accent)" }}>
                    {u.ixName}
                  </Link>{" "}
                  · {u.metro}
                </span>
                {u.isEquinix ? <span className="rd-tagx">Equinix</span> : null}
              </span>
              <span className="rd-bar">
                <i
                  style={{
                    width: `${(u.toG / (upgrades[0]?.toG || 1)) * 100}%`,
                    background: u.isEquinix ? "var(--equinix)" : "var(--accent)",
                  }}
                />
              </span>
              <span className="amt rd-num">
                {u.fromG.toFixed(0)}G → {u.toG.toFixed(0)}G{" "}
                <span className="rd-up">(+{u.deltaG.toFixed(0)}G)</span>
              </span>
            </div>
          ))}
        </Panel>
        <div className="rd-footnote">
          Upgrades on Equinix exchanges are tagged violet — the untagged rows are capacity landing on competitor
          exchanges, which is usually the more interesting list.
        </div>
      </div>
    </>
  );
}
