import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Panel, useTooltip } from "./bits";
import { fmtDayMonth, movementFor, movementHeatmap } from "./data";

/* Movement — the market-level map: metros × months of net change.
   Click any cell to see that metro/month's composition, then jump into
   Market changes (network × IX) pre-filtered to that metro and period. */

export default function MovementPage() {
  const { scoped, derived } = useSnapshot();
  const { metros } = derived;
  const { search } = useLocation();
  const { bind, node: tipNode } = useTooltip();

  const heat = useMemo(() => movementHeatmap(scoped), [scoped]);
  const { transitions, rows } = heat;

  const [tIdx, setTIdx] = useState(transitions.length - 1);
  const [metric, setMetric] = useState<"cap" | "nets">("cap");
  const [metro, setMetro] = useState(metros[0]?.metro || "Singapore");

  useEffect(() => {
    if (tIdx > transitions.length - 1) setTIdx(Math.max(0, transitions.length - 1));
  }, [transitions.length, tIdx]);
  useEffect(() => {
    if (!rows.some((r) => r.metro === metro) && rows.length) setMetro(rows[0].metro);
  }, [rows, metro]);

  const sel = transitions[Math.min(tIdx, transitions.length - 1)];
  const selLabel = sel ? `${fmtDayMonth(sel.from)} → ${fmtDayMonth(sel.to)}` : "";
  const mv = useMemo(() => (sel ? movementFor(scoped, sel.to, sel.from, metro) : null), [scoped, sel, metro]);

  const changesLink = sel
    ? { pathname: "/changes", search: `${search ? search + "&" : "?"}from=${sel.from}&to=${sel.to}&focus=${encodeURIComponent(metro)}` }
    : { pathname: "/changes", search };

  const heatColor = (v: number) => {
    const max = metric === "cap" ? heat.maxAbsCapT : heat.maxAbsNets;
    if (Math.abs(v) < (metric === "cap" ? 0.005 : 0.5)) return "var(--surface-2)";
    const pct = Math.min(1, Math.abs(v) / max);
    const hue = v > 0 ? "var(--present)" : "var(--gap)";
    return `color-mix(in srgb, ${hue} ${Math.round(10 + pct * 55)}%, var(--surface))`;
  };
  const cellText = (c: { dCapT: number; dNets: number }) => {
    if (metric === "cap") return Math.abs(c.dCapT) < 0.05 ? "·" : `${c.dCapT > 0 ? "+" : "−"}${Math.abs(c.dCapT).toFixed(1)}`;
    return c.dNets === 0 ? "·" : `${c.dNets > 0 ? "+" : "−"}${Math.abs(c.dNets)}`;
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
        <Link className="rd-rowlink" key={r.asn} to={{ pathname: `/net/${r.asn}`, search }}>
          <div className="rd-mover">
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
        </Link>
      ))
    ) : (
      <div style={{ padding: "12px 11px", color: "var(--muted)", fontSize: 12.5 }}>{empty}</div>
    );

  return (
    <>
      {/* month slider + metric toggle */}
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

      {/* heatmap */}
      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>Where the market moved</h2>
          <span className="note">Green = growth, red = shrinkage · hover for detail · click a cell to inspect</span>
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
                    const t = transitions[i];
                    return (
                      <td
                        key={i}
                        className={`cell rd-num${isSel ? " selcell" : ""}${i === tIdx ? " selcol" : ""}`}
                        style={{ background: heatColor(v) }}
                        onClick={() => {
                          setMetro(r.metro);
                          setTIdx(i);
                        }}
                        {...bind(
                          <>
                            <div className="th">
                              {r.metro} · {fmtDayMonth(t.from)} → {fmtDayMonth(t.to)}
                            </div>
                            <div className="tl">
                              <span>Capacity</span>
                              <b className={c.dCapT >= 0 ? "rd-up" : "rd-down"}>
                                {c.dCapT >= 0 ? "+" : "−"}
                                {Math.abs(c.dCapT).toFixed(2)} Tbps
                              </b>
                            </div>
                            <div className="tl">
                              <span>Networks</span>
                              <b className={c.dNets >= 0 ? "rd-up" : "rd-down"}>
                                {c.dNets >= 0 ? "+" : "−"}
                                {Math.abs(c.dNets)}
                              </b>
                            </div>
                            <div className="thint">Click to inspect this cell</div>
                          </>
                        )}
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

      {/* selected cell detail */}
      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>
            {metro} · {selLabel}
          </h2>
          <Link className="rd-btn" to={changesLink}>
            Which networks &amp; exchanges? →
          </Link>
        </div>
        <div className="rd-split">
          <Panel title="Capacity waterfall" tag={selLabel}>
            <div className="rd-wfall">
              {wfRow("Newly listed", wf.entrantsT, wf.entrantsN, "var(--present)")}
              {wfRow("Upgrades", wf.upgradesT, wf.upgradesN, "var(--accent)")}
              {wfRow("Downgrades", wf.downgradesT, wf.downgradesN, "var(--watch)")}
              {wfRow("Delisted", -wf.departuresT, wf.departuresN, "var(--gap)")}
            </div>
            <div style={{ padding: "8px 11px 4px", fontSize: 11.5, color: "var(--faint)" }}>
              Net {wf.netT >= 0 ? "+" : "−"}
              {Math.abs(wf.netT).toFixed(2)} Tbps in {metro} this period.
            </div>
          </Panel>
          <Panel title="Why this reads 'listed', not 'deployed'">
            <div style={{ padding: "10px 11px", color: "var(--muted)", fontSize: 12.5, lineHeight: 1.6 }}>
              PeeringDB is self-reported. A "new" network is sometimes one that finally updated its record, and a
              delisting isn't always a physical exit. Treat this as the change in <b>visible</b> presence — the right
              call list, just verify before quoting.
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

      {tipNode}
    </>
  );
}
