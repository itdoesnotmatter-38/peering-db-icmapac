import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Bar, Panel } from "./bits";
import { exchangesRanking, fmtMonth, tokenMatch } from "./data";

/* Browsable directory of every exchange in scope — search, ranked by
   deployed capacity, Equinix pinned, click through to the full profile. */

export default function ExchangesPage() {
  const { scoped, derived, scopeName } = useSnapshot();
  const { latest } = derived;
  const { search } = useLocation();
  const [q, setQ] = useState("");

  const all = useMemo(() => exchangesRanking(scoped, latest), [scoped, latest]);
  const filtered = useMemo(() => {
    if (!q.trim()) return all;
    return all.filter((x) => tokenMatch(q, `${x.name} ${x.metro}`, x.ixId));
  }, [all, q]);

  return (
    <>
      <div className="rd-slider-bar" style={{ alignItems: "center" }}>
        <div className="rd-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exchanges by name or metro…" aria-label="Search exchanges" />
        </div>
        <div className="rd-grow" />
        <span className="note rd-num">
          {filtered.length} of {all.length} exchanges · {scopeName}
        </span>
      </div>

      <Panel title="Exchanges by deployed capacity" tag={fmtMonth(latest)}>
        {filtered.slice(0, 60).map((x, i) => (
          <Link key={x.ixId} to={{ pathname: `/exchange/${x.ixId}`, search }} className="rd-rowlink">
            <div className={`rd-dirrow${x.isEquinix ? " eqxrow" : ""}`}>
              <span className="rk rd-num">{i + 1}</span>
              <span className="nm" style={x.isEquinix ? { color: "var(--equinix)" } : undefined}>
                {x.name}
                <span className="rd-cc" style={{ marginLeft: 7 }}>
                  {x.metro}
                </span>
              </span>
              <Bar pct={(x.capT / (all[0]?.capT || 1)) * 100} color={x.isEquinix ? "var(--equinix)" : "var(--accent)"} />
              <span className="pv rd-num">{x.capT.toFixed(1)}T</span>
              <span className="meta rd-num">{x.nets} nets</span>
            </div>
          </Link>
        ))}
        {!filtered.length ? <div style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 13 }}>No exchanges match “{q}”.</div> : null}
      </Panel>
    </>
  );
}
