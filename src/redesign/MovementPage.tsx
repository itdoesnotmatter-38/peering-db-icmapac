import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Panel } from "./bits";
import { fmtDayMonth, movementFor, movementHeatmap, upgradesFor } from "./data";

/* Movement, rebuilt around a metros × months heatmap:
   - the month slider picks which snapshot transition you're looking at
   - every heatmap cell is clickable → that metro/month's detail below
   - green = growth, red = shrinkage; toggle capacity vs network count */

export default function MovementPage() {
  const { scoped, derived } = useSnapshot();
  const { metros } = derived;
  const { search } = useLocation();

  const heat = useMemo(() => movementHeatmap(scoped), [scoped]);
  const { transitions, rows } = heat;

  const [tIdx, setTIdx] = useState(transitions.length - 1);
  const [metric, setMetric] = useState<"cap" | "nets">("cap");
  const [metro, setMetro] = useState(metros[0]?.metro || "Singapore");

  /* keep selections valid when scope changes */
  useEffect(() => {
    if (tIdx > transitions.length - 1) setTIdx(Math.max(0, transitions.length - 1));
  }, [transitions.length, tIdx]);
  useEffect(() => {
    if (!rows.some((r) => r.metro === metro) && rows.length) setMetro(rows[0].metro);
  }, [rows, metro]);

  const sel = transitions[Math.min(tIdx, transitions.length - 1)];
  const selLabel = sel ? `${fmtDayMonth(sel.from)} → ${fmtDayMonth(sel.to)}` : "";

  const mv = useMemo(
    () => (sel ? movementFor(scoped, sel.to, sel.from, metro) : null),
    [scoped, sel, metro]
  );
  const upgrades = useMemo(() => (sel ? upgradesFor(scoped, sel.to, sel.from) : []), [scoped, sel]);

  const heatColor = (v: number) => {
    const max = metric === "cap" ? heat.maxAbsCapT : heat.maxAbsNets;
    if (Math.abs(v) < (metric === "cap" ? 0.005 : 0.5)) return "var(--surface-2)";
    const pct = Math.min(1, Math.abs(v) / max);
    const hue = v > 0 ? "var(--present)" : "var(--gap)";
    return `color-mix(in srgb, ${hue} ${Math.round(10 + pct * 55)}%, var(--surface))`;
  };
  const cellText = (c: { dCapT: number; dNets: number }) => {
    if (metric === "cap") {
      if (Math.abs(c.dCapT) < 0.05) return "·";
      return `${c.dCapT > 0 ? "+" : "−"}${Math.abs(c.dCapT).toFixed(1)}`;
    }
    if (c.dNets === 0) return "·";
    return `${c.dNets > 0 ? "+" : "−"}${Math.abs(c.dNets)}`;
  };

  if (!sel || !mv) {
    return <div className="rd-center">Not enough snapshots yet — movement needs at least two.</div>;
  }
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

  const list = (rowsIn: typeof mv.entrants, empty: string) =>
    rowsIn.length ? (
      rowsIn.slice(0, 8).map((r) => (
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
      {/* ---- month slider + metric toggle ---- */}
      <div className="rd-slider-bar">
        <div className="rd-slider-block">
          <span className="rd-eyebrow">Month</span>
          <input
            type="range"
            className="rd-slider"
            min={0}
            max={transitions.length - 1}
            step={1}
            value={Math.min(tIdx, transitions.length - 1)}
            onChange={(e) => setTIdx(Number(e.target.value))}
            aria-label="Select month"
          />
          <div className="rd-slider-labels">
            {transitions.map((t, i) => (
              <button key={t.to} className={`rd-slider-tick${i === tIdx ? " on" : ""}`} onClick={() => setTIdx(i)}>
                {fmtDayMonth(t.to)}
              </button>
            ))}
          </div>
        </div>
        <div className="rd-grow" />
        <div className="rd-chips" style={{ marginBottom: 0 }}>
          <button className={`rd-chip${metric === "cap" ? " on" : ""}`} onClick={() => setMetric("cap")}>
            Capacity Δ (Tbps)
          </button>
          <button className={`rd-chip${metric === "nets" ? " on" : ""}`} onClick={() => setMetric("nets")}>
            Networks Δ
          </button>
        </div>
      </div>

      {/* ---- heatmap ---- */}
      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>Where the market moved</h2>
          <span className="note">Green = growth, red = shrinkage · click any cell to inspect that metro and month</span>
        </div>
        <div className="rd-heatwrap">
          <table className="rd-heat">
            <thead>
              <tr>
                <th className="mname" />
                {transitions.map((t, i) => (
                  <th key={t.to} className={i === tIdx ? "sel" : ""} onClick={() => setTIdx(i)}>
                    {fmtDayMonth(t.to)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.metro} className={r.metro === metro ? "selrow" : ""}>
                  <td className="mname" onClick={() => setMetro(r.metro)}>
                    {r.metro}
                  </td>
                  {r.cells.map((c, i) => {
                    const v = metric === "cap" ? c.dCapT : c.dNets;
                    const isSel = r.metro === metro && i === tIdx;
                    return (
                      <td
                        key={i}
                        className={`cell rd-num${isSel ? " selcell" : ""}${i === tIdx ? " selcol" : ""}`}
                        style={{ background: heatColor(v) }}
                        onClick={() => {
                          setMetro(r.metro);
                          setTIdx(i);
                        }}
                      >
                        {cellText(c)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- selected cell detail ---- */}
      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>
            {metro} · {selLabel}
          </h2>
          <span className="note rd-num">
            net capacity change {wf.netT >= 0 ? "+" : "−"}
            {Math.abs(wf.netT).toFixed(2)} Tbps
          </span>
        </div>
        <div className="rd-split">
          <Panel title="Capacity waterfall" tag={selLabel}>
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
            {list(mv.entrants, "No new networks in this period.")}
          </Panel>
          <Panel title={`Delisted from ${metro}`} tag={`−${mv.departures.length}`}>
            {list(mv.departures, "No departures in this period.")}
          </Panel>
        </div>
      </div>

      {/* ---- upgrade radar for the selected month ---- */}
      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>Upgrade radar · {selLabel}</h2>
          <span className="note">Networks that added ≥100G on a single exchange in this period (all metros in scope)</span>
        </div>
        <Panel title={`${upgrades.length} upgrades ≥100G`} tag={fmtDayMonth(sel.to)}>
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
          {!upgrades.length ? (
            <div style={{ padding: "12px 11px", color: "var(--muted)", fontSize: 12.5 }}>
              No ≥100G single-exchange upgrades in this period.
            </div>
          ) : null}
        </Panel>
        <div className="rd-footnote">
          Upgrades on Equinix exchanges are tagged violet — the untagged rows are capacity landing on competitor
          exchanges, which is usually the more interesting list.
        </div>
      </div>
    </>
  );
}
