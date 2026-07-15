import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Panel, Sparkline } from "./bits";
import { METRO_CODES, NetworkDirEntry, fmtMonth, networksDirectory, tokenMatch } from "./data";

/* Networks directory — every row is a fact sheet: trajectory sparkline,
   capacity, MoM change, Equinix share, footprint, anchor metro, and a NEW
   badge for entrants. Columns sort on click. Multi-term search (OR). */

type SortKey = "cap" | "delta" | "eqx" | "ports" | "metros";
const GRID = "26px minmax(220px,1fr) 76px 80px 78px 84px 74px 56px";

const capLbl = (t: number) => (t >= 0.05 ? `${t.toFixed(1)}T` : t > 0 ? `${(t * 1000).toFixed(0)}G` : "—");
const dLbl = (t: number) =>
  Math.abs(t) < 0.005 ? "·" : `${t > 0 ? "+" : "−"}${Math.abs(t) >= 1 ? Math.abs(t).toFixed(1) + "T" : (Math.abs(t) * 1000).toFixed(0) + "G"}`;

export default function NetworksPage() {
  const { scoped, derived, scopeName } = useSnapshot();
  const { latest } = derived;
  const { search } = useLocation();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "cap", asc: false });

  const all = useMemo(() => networksDirectory(scoped, latest), [scoped, latest]);

  const filtered = useMemo(() => {
    const base = q.trim() ? all.filter((n) => tokenMatch(q, n.name, n.asn)) : all;
    const val = (n: NetworkDirEntry) =>
      sort.key === "cap" ? n.capT : sort.key === "delta" ? n.dCapT : sort.key === "eqx" ? n.eqxPct : sort.key === "ports" ? n.ports : n.metros;
    return [...base].sort((a, b) => (sort.asc ? val(a) - val(b) : val(b) - val(a)));
  }, [all, q, sort]);

  const shown = filtered.slice(0, 60);

  const Head = ({ k, label }: { k: SortKey; label: string }) => (
    <button className={`sort${sort.key === k ? " on" : ""}`} onClick={() => setSort((s) => ({ key: k, asc: s.key === k ? !s.asc : false }))}>
      {label} {sort.key === k ? (sort.asc ? "↑" : "↓") : ""}
    </button>
  );

  return (
    <>
      <div className="rd-slider-bar" style={{ alignItems: "center" }}>
        <div className="rd-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search networks — names or ASNs, several at once…" aria-label="Search networks" />
        </div>
        <div className="rd-grow" />
        <span className="note rd-num">
          {q ? `${filtered.length} match` : `${all.length} networks`} · {scopeName}
        </span>
      </div>

      <Panel title={q ? "Search results" : "Networks by deployed capacity"} tag={fmtMonth(latest)}>
        <div className="rd-dirhead" style={{ gridTemplateColumns: GRID }}>
          <span />
          <span>Network</span>
          <span className="c">Trend</span>
          <span className="c">
            <Head k="cap" label="Capacity" />
          </span>
          <span className="c">
            <Head k="delta" label="Δ MoM" />
          </span>
          <span className="c">
            <Head k="eqx" label="on Equinix" />
          </span>
          <span className="c">
            <Head k="ports" label="IX · DC" />
          </span>
          <span className="c">
            <Head k="metros" label="Metros" />
          </span>
        </div>
        {shown.map((n, i) => (
          <Link key={n.asn} to={{ pathname: `/net/${n.asn}`, search }} className="rd-rowlink">
            <div className="rd-dirrow facts" style={{ gridTemplateColumns: GRID }}>
              <span className="rk rd-num">{i + 1}</span>
              <span className="nm">
                {n.name}
                <span className="rd-cc" style={{ marginLeft: 7 }}>
                  AS{n.asn}
                </span>
                {n.anchorMetro ? (
                  <span className="rd-cc" style={{ marginLeft: 4 }} title={`Biggest market: ${n.anchorMetro}`}>
                    {METRO_CODES[n.anchorMetro] || n.anchorMetro}
                  </span>
                ) : null}
                <span className="ty">{n.type}</span>
                {n.isNew ? <span className="rd-newchip">NEW</span> : null}
              </span>
              <span className="spk">{n.capT > 0 ? <Sparkline points={n.spark} width={62} height={20} /> : null}</span>
              <span className="pv rd-num">{capLbl(n.capT)}</span>
              <span className={`pv rd-num ${n.dCapT > 0.005 ? "rd-up" : n.dCapT < -0.005 ? "rd-down" : "rd-flat"}`}>{dLbl(n.dCapT)}</span>
              <span className="pv rd-num" style={n.eqxPct > 0 ? { color: "var(--equinix)" } : { color: "var(--faint)", fontWeight: 400 }}>
                {n.capT > 0 ? `${n.eqxPct.toFixed(0)}%` : "—"}
              </span>
              <span className="meta rd-num">
                {n.ports} · {n.dcs}
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
      <div className="rd-footnote">
        Click a column to sort; click again to flip. Tip: sort “on Equinix” ascending — big networks near the top with a
        low violet number are the under-penetrated ones. NEW marks networks first listed in the latest snapshot.
      </div>
    </>
  );
}
