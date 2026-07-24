import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Panel, Sparkline, useTooltip } from "./bits";
import { ExchangeRank, IxContributor, exchangeMovers, exchangesRanking, fmtMonth, tokenMatch } from "./data";

/* Exchanges directory — fact columns instead of a decorative bar:
   trajectory, capacity, MoM capacity change, MoM member change, and
   share of its own metro. Columns sort on click; multi-term search. */

type SortKey = "cap" | "delta" | "deltaq" | "dnets" | "share" | "dshare" | "nets";
const GRID = "26px minmax(180px,1fr) 54px 54px 70px 68px 68px 74px 66px 72px 48px";
// signed percentage-point change for the Δ share column
const ppLbl = (v: number) => (Math.abs(v) < 0.05 ? "·" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}pp`);

const capLbl = (t: number) => (t >= 0.05 ? `${t.toFixed(1)}T` : t > 0 ? `${(t * 1000).toFixed(0)}G` : "—");
const dLbl = (t: number) =>
  Math.abs(t) < 0.005 ? "·" : `${t > 0 ? "+" : "−"}${Math.abs(t) >= 1 ? Math.abs(t).toFixed(1) + "T" : (Math.abs(t) * 1000).toFixed(0) + "G"}`;
// signed Gbps delta for the mover tooltip
const gd = (g: number) => `${g > 0 ? "+" : "−"}${Math.abs(g) >= 1000 ? (Math.abs(g) / 1000).toFixed(1) + "T" : Math.abs(g).toFixed(0) + "G"}`;

// tooltip body: the networks that drove an exchange's capacity change
function moverTip(title: string, list: IxContributor[]) {
  return (
    <>
      <div className="th">{title}</div>
      {list.length ? (
        list.map((mv) => (
          <div className="tl" key={mv.asn}>
            <span>{mv.name.length > 24 ? `${mv.name.slice(0, 23)}…` : mv.name}</span>
            <b className={mv.dG > 0 ? "rd-up" : "rd-down"}>{gd(mv.dG)}</b>
          </div>
        ))
      ) : (
        <div className="tl">
          <span>No member-level change</span>
        </div>
      )}
    </>
  );
}

// tooltip body: why the exchange's metro share moved — own growth vs the whole metro's
function shareTip(x: ExchangeRank, sibs: ExchangeRank[]) {
  const metroDMoM = sibs.reduce((s, e) => s + e.dCapT, 0);
  const topRival = sibs.filter((e) => e.ixId !== x.ixId).sort((a, b) => b.dCapT - a.dCapT)[0];
  const n = x.shareSpark.length;
  const ppMoM = n > 1 ? x.shareSpark[n - 1] - x.shareSpark[n - 2] : 0;
  const ppQoQ = n >= 4 ? x.shareSpark[n - 1] - x.shareSpark[n - 4] : n > 1 ? x.shareSpark[n - 1] - x.shareSpark[0] : 0;
  const pp = (v: number) => (Math.abs(v) < 0.05 ? "0pp" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}pp`);
  const cls = (v: number) => (v > 0.05 ? "rd-up" : v < -0.05 ? "rd-down" : "");
  return (
    <>
      <div className="th">{x.name} — why the share moved</div>
      <div className="tl">
        <span>Share of {x.metro}</span>
        <b>{x.metroSharePct.toFixed(0)}%</b>
      </div>
      <div className="tl">
        <span>Δ share · MoM / QoQ</span>
        <b>
          <span className={cls(ppMoM)}>{pp(ppMoM)}</span> / <span className={cls(ppQoQ)}>{pp(ppQoQ)}</span>
        </b>
      </div>
      <div className="tl">
        <span>This IX (MoM)</span>
        <b className={cls(x.dCapT)}>{gd(x.dCapT * 1000)}</b>
      </div>
      <div className="tl">
        <span>All {x.metro} IX (MoM)</span>
        <b className={cls(metroDMoM)}>{gd(metroDMoM * 1000)}</b>
      </div>
      {topRival && topRival.dCapT > 0.005 ? (
        <div className="tl">
          <span>Gaining most here</span>
          <b>
            {topRival.name.length > 16 ? `${topRival.name.slice(0, 15)}…` : topRival.name} {gd(topRival.dCapT * 1000)}
          </b>
        </div>
      ) : null}
    </>
  );
}

export default function ExchangesPage() {
  const { scoped, derived, scopeName } = useSnapshot();
  const { latest } = derived;
  const { search } = useLocation();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "cap", asc: false });

  const all = useMemo(() => exchangesRanking(scoped, latest), [scoped, latest]);
  const movers = useMemo(() => exchangeMovers(scoped, latest), [scoped, latest]);
  const metroByMetro = useMemo(() => {
    const m = new Map<string, ExchangeRank[]>();
    all.forEach((x) => {
      const a = m.get(x.metro);
      if (a) a.push(x);
      else m.set(x.metro, [x]);
    });
    return m;
  }, [all]);
  const { bind, node: tipNode } = useTooltip();

  const filtered = useMemo(() => {
    const base = q.trim() ? all.filter((x) => tokenMatch(q, `${x.name} ${x.metro}`, x.ixId)) : all;
    const val = (x: ExchangeRank) =>
      sort.key === "cap"
        ? x.capT
        : sort.key === "delta"
        ? x.dCapT
        : sort.key === "deltaq"
        ? x.dCapQ
        : sort.key === "dnets"
        ? x.dNets
        : sort.key === "share"
        ? x.metroSharePct
        : sort.key === "dshare"
        ? x.dSharePP
        : x.nets;
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
          <span className="c">Capacity trend</span>
          <span className="c">Share trend</span>
          <span className="c">
            <Head k="cap" label="Capacity" />
          </span>
          <span className="c">
            <Head k="delta" label="Δ MoM" />
          </span>
          <span className="c">
            <Head k="deltaq" label="Δ QoQ" />
          </span>
          <span className="c">
            <Head k="dnets" label="Δ members" />
          </span>
          <span className="c">
            <Head k="share" label="Metro share" />
          </span>
          <span className="c">
            <Head k="dshare" label="Δ share" />
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
              <span className="spk">{x.capT > 0 ? <Sparkline points={x.spark} width={50} height={20} /> : null}</span>
              <span className="spk">{x.metroSharePct > 0 ? <Sparkline points={x.shareSpark} width={50} height={20} /> : null}</span>
              <span className="pv rd-num">{capLbl(x.capT)}</span>
              <span
                className={`pv rd-num movable ${x.dCapT > 0.005 ? "rd-up" : x.dCapT < -0.005 ? "rd-down" : "rd-flat"}`}
                {...bind(moverTip(`${x.name} — what moved (MoM)`, movers.get(x.ixId)?.mom || []))}
              >
                {dLbl(x.dCapT)}
              </span>
              <span
                className={`pv rd-num movable ${x.dCapQ > 0.005 ? "rd-up" : x.dCapQ < -0.005 ? "rd-down" : "rd-flat"}`}
                {...bind(moverTip(`${x.name} — what moved (QoQ)`, movers.get(x.ixId)?.qoq || []))}
              >
                {dLbl(x.dCapQ)}
              </span>
              <span className={`pv rd-num ${x.dNets > 0 ? "rd-up" : x.dNets < 0 ? "rd-down" : "rd-flat"}`}>
                {x.dNets === 0 ? "·" : `${x.dNets > 0 ? "+" : "−"}${Math.abs(x.dNets)}`}
              </span>
              <span className="pv rd-num movable" {...bind(shareTip(x, metroByMetro.get(x.metro) || []))}>
                {x.metroSharePct.toFixed(0)}%
              </span>
              <span
                className={`pv rd-num movable ${x.dSharePP > 0.05 ? "rd-up" : x.dSharePP < -0.05 ? "rd-down" : "rd-flat"}`}
                title={`Metro-share change · MoM ${ppLbl(x.dSharePP)} · QoQ ${ppLbl(x.dShareQPP)}`}
              >
                {ppLbl(x.dSharePP)}
              </span>
              <span className="meta rd-num">{x.nets}</span>
            </div>
          </Link>
        ))}
        {!filtered.length ? <div style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 13 }}>No exchanges match “{q}”.</div> : null}
      </Panel>
      <div className="rd-footnote">
        Click a column to sort; click again to flip. Hover Δ MoM or Δ QoQ to see which networks moved the needle. “Δ
        members” is the competitor early-warning column — an exchange gaining networks month over month is ramping. Metro
        share is the exchange's slice of its own market's IX capacity; <b>Δ share</b> is how that slice moved in percentage
        points (month-over-month; hover for the quarter) — positive means it's taking share from metro rivals.
      </div>
      {tipNode}
    </>
  );
}
