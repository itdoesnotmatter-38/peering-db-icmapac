import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Panel, Sparkline } from "./bits";
import { ExchangeRank, exchangesRanking, fmtMonth, tokenMatch } from "./data";

/* Exchanges directory — fact columns instead of a decorative bar:
   trajectory, capacity, MoM capacity change, MoM member change, and
   share of its own metro. Columns sort on click; multi-term search. */

type SortKey = "cap" | "delta" | "dnets" | "share" | "nets";
const GRID = "26px minmax(220px,1fr) 76px 80px 78px 84px 76px 80px 60px";

const capLbl = (t: number) => (t >= 0.05 ? `${t.toFixed(1)}T` : t > 0 ? `${(t * 1000).toFixed(0)}G` : "—");
const dLbl = (t: number) =>
  Math.abs(t) < 0.005 ? "·" : `${t > 0 ? "+" : "−"}${Math.abs(t) >= 1 ? Math.abs(t).toFixed(1) + "T" : (Math.abs(t) * 1000).toFixed(0) + "G"}`;

export default function ExchangesPage() {
  const { scoped, derived, scopeName } = useSnapshot();
  const { latest } = derived;
  const { search } = useLocation();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "cap", asc: false });

  const all = useMemo(() => exchangesRanking(scoped, latest), [scoped, latest]);

  const filtered = useMemo(() => {
    const base = q.trim() ? all.filter((x) => tokenMatch(q, `${x.name} ${x.metro}`, x.ixId)) : all;
    const val = (x: ExchangeRank) =>
      sort.key === "cap" ? x.capT : sort.key === "delta" ? x.dCapT : sort.key === "dnets" ? x.dNets : sort.key === "share" ? x.metroSharePct : x.nets;
    return [...base].sort((a, b) => (sort.asc ? val(a) - val(b) : val(b) - val(a)));
  }, [all, q, sort]);

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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exchanges — names or metros, several at once…" aria-label="Search exchanges" />
        </div>
        <div className="rd-grow" />
        <span className="note rd-num">
          {q ? `${filtered.length} match` : `${all.length} exchanges`} · {scopeName}
        </span>
      </div>

      <Panel title={q ? "Search results" : "Exchanges by deployed capacity"} tag={fmtMonth(latest)}>
        <div className="rd-dirhead" style={{ gridTemplateColumns: GRID }}>
          <span />
          <span>Exchange</span>
          <span className="c">Trend</span>
          <span className="c">
            <Head k="cap" label="Capacity" />
          </span>
          <span className="c">
            <Head k="delta" label="Δ MoM" />
          </span>
          <span className="c">
            <Head k="dnets" label="Δ members" />
          </span>
          <span className="c">Share trend</span>
          <span className="c">
            <Head k="share" label="Metro share" />
          </span>
          <span className="c">
            <Head k="nets" label="Nets" />
          </span>
        </div>
        {filtered.slice(0, 60).map((x, i) => (
          <Link key={x.ixId} to={{ pathname: `/exchange/${x.ixId}`, search }} className="rd-rowlink">
            <div className={`rd-dirrow facts${x.isEquinix ? " eqxrow" : ""}`} style={{ gridTemplateColumns: GRID }}>
              <span className="rk rd-num">{i + 1}</span>
              <span className="nm" style={x.isEquinix ? { color: "var(--equinix)" } : undefined}>
                {x.name.length > 30 ? `${x.name.slice(0, 29)}…` : x.name}
                <span className="rd-cc" style={{ marginLeft: 7 }}>
                  {x.metro}
                </span>
              </span>
              <span className="spk">{x.capT > 0 ? <Sparkline points={x.spark} width={62} height={20} /> : null}</span>
              <span className="pv rd-num">{capLbl(x.capT)}</span>
              <span className={`pv rd-num ${x.dCapT > 0.005 ? "rd-up" : x.dCapT < -0.005 ? "rd-down" : "rd-flat"}`}>{dLbl(x.dCapT)}</span>
              <span className={`pv rd-num ${x.dNets > 0 ? "rd-up" : x.dNets < 0 ? "rd-down" : "rd-flat"}`}>
                {x.dNets === 0 ? "·" : `${x.dNets > 0 ? "+" : "−"}${Math.abs(x.dNets)}`}
              </span>
              <span className="spk">{x.metroSharePct > 0 ? <Sparkline points={x.shareSpark} width={62} height={20} /> : null}</span>
              <span className="pv rd-num">{x.metroSharePct.toFixed(0)}%</span>
              <span className="meta rd-num">{x.nets}</span>
            </div>
          </Link>
        ))}
        {!filtered.length ? <div style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 13 }}>No exchanges match “{q}”.</div> : null}
      </Panel>
      <div className="rd-footnote">
        Click a column to sort; click again to flip. “Δ members” is the competitor early-warning column — an exchange
        gaining networks month over month is ramping. Metro share is the exchange's slice of its own market's IX capacity.
      </div>
    </>
  );
}
