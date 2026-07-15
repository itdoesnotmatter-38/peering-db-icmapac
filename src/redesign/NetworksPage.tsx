import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Panel } from "./bits";
import { fmtMonth, networksDirectory, tokenMatch } from "./data";

/* Browsable directory of every network in scope — search by name or ASN,
   ranked by deployed capacity, click through to the full profile. */

export default function NetworksPage() {
  const { scoped, derived, scopeName } = useSnapshot();
  const { latest } = derived;
  const { search } = useLocation();
  const [q, setQ] = useState("");

  const all = useMemo(() => networksDirectory(scoped, latest), [scoped, latest]);
  const filtered = useMemo(() => {
    if (!q.trim()) return all;
    return all.filter((n) => tokenMatch(q, n.name, n.asn));
  }, [all, q]);

  const shown = filtered.slice(0, 60);

  return (
    <>
      <div className="rd-slider-bar" style={{ alignItems: "center" }}>
        <div className="rd-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search networks by name or ASN…" aria-label="Search networks" />
        </div>
        <div className="rd-grow" />
        <span className="note rd-num">
          {q ? `${filtered.length} match` : `${all.length} networks`} · {scopeName}
        </span>
      </div>

      <Panel title={q ? "Search results" : "Networks by deployed capacity"} tag={fmtMonth(latest)}>
        <div className="rd-dirhead">
          <span />
          <span>Network</span>
          <span className="c">Capacity</span>
          <span className="c">Δ MoM</span>
          <span className="c">on Equinix</span>
          <span className="c">Metros</span>
        </div>
        {shown.map((n, i) => (
          <Link key={n.asn} to={{ pathname: `/net/${n.asn}`, search }} className="rd-rowlink">
            <div className="rd-dirrow facts">
              <span className="rk rd-num">{q ? "" : i + 1}</span>
              <span className="nm">
                {n.name}
                <span className="rd-cc" style={{ marginLeft: 7 }}>
                  AS{n.asn}
                </span>
                <span className="ty">{n.type}</span>
              </span>
              <span className="pv rd-num">{n.capT >= 0.05 ? `${n.capT.toFixed(1)}T` : n.capT > 0 ? `${(n.capT * 1000).toFixed(0)}G` : "—"}</span>
              <span className={`pv rd-num ${n.dCapT > 0.005 ? "rd-up" : n.dCapT < -0.005 ? "rd-down" : "rd-flat"}`}>
                {Math.abs(n.dCapT) < 0.005
                  ? "·"
                  : `${n.dCapT > 0 ? "+" : "−"}${Math.abs(n.dCapT) >= 1 ? Math.abs(n.dCapT).toFixed(1) + "T" : (Math.abs(n.dCapT) * 1000).toFixed(0) + "G"}`}
              </span>
              <span className="pv rd-num" style={n.eqxPct > 0 ? { color: "var(--equinix)" } : { color: "var(--faint)", fontWeight: 400 }}>
                {n.capT > 0 ? `${n.eqxPct.toFixed(0)}%` : "—"}
              </span>
              <span className="meta rd-num">{n.metros}</span>
            </div>
          </Link>
        ))}
        {!filtered.length ? <div style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 13 }}>No networks match “{q}”.</div> : null}
        {filtered.length > 60 ? (
          <div style={{ padding: "12px 12px", color: "var(--faint)", fontSize: 12 }}>
            Showing top 60 of {filtered.length.toLocaleString()} — refine your search to narrow.
          </div>
        ) : null}
      </Panel>
    </>
  );
}
