import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Bar, Panel } from "./bits";
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
        {shown.map((n, i) => (
          <Link key={n.asn} to={{ pathname: `/net/${n.asn}`, search }} className="rd-rowlink">
            <div className="rd-dirrow">
              <span className="rk rd-num">{q ? "" : i + 1}</span>
              <span className="nm">
                {n.name}
                <span className="rd-cc" style={{ marginLeft: 7 }}>
                  AS{n.asn}
                </span>
                <span className="ty">{n.type}</span>
              </span>
              <Bar pct={(n.capT / (all[0]?.capT || 1)) * 100} />
              <span className="pv rd-num">{n.capT.toFixed(1)}T</span>
              <span className="meta rd-num">
                {n.metros} metro{n.metros === 1 ? "" : "s"}
              </span>
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
