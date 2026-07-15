import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Bar, Delta, Kpi, NetworkTypeahead, Panel } from "./bits";
import { fmtDate, fmtMonth, loadWatchlist, networksDirectory, saveWatchlist, watchRows } from "./data";

export default function OverviewPage() {
  const { scoped, derived, scopeName } = useSnapshot();
  const { search } = useLocation();
  const { totals, deltas, capSeries, netSeries, metros, metroCapMovers, networkMovers, latest, prev } = derived;
  const vs = fmtMonth(prev);

  /* ---- watchlist ---- */
  const [watch, setWatch] = useState<number[]>(() => loadWatchlist());
  const rows = useMemo(() => watchRows(scoped, latest, prev, watch), [scoped, latest, prev, watch]);
  const dir = useMemo(() => networksDirectory(scoped, latest), [scoped, latest]);
  const addWatch = (asn: number) => {
    if (!Number.isFinite(asn) || asn <= 0 || watch.includes(asn)) return;
    const next = [...watch, asn];
    setWatch(next);
    saveWatchlist(next);
  };
  const removeWatch = (asn: number) => {
    const next = watch.filter((a) => a !== asn);
    setWatch(next);
    saveWatchlist(next);
  };

  const maxCap = metros[0]?.capT || 1;

  return (
    <>
      <div className="rd-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2a10 10 0 1 0 10 10" />
          <path d="M12 8v4l3 2" />
        </svg>
        <div>
          <b>Loaded instantly from the {fmtDate(latest)} snapshot.</b> Use <b>Live explore</b> when you need today's
          PeeringDB data for a specific metro — this baseline covers everything else.
        </div>
      </div>

      <div className="rd-kpis">
        <Kpi label="Deployed capacity" value={totals.capT.toFixed(1)} unit="Tbps" delta={deltas.capT} deltaUnit=" Tbps" vs={vs} spark={capSeries} />
        <Kpi label="Unique networks" value={totals.nets.toLocaleString()} delta={deltas.nets} vs={vs} spark={netSeries} />
        <Kpi label="Exchanges" value={String(totals.ix)} delta={deltas.ix} vs={vs} />
        <Kpi label="Facilities" value={String(totals.fac)} delta={deltas.fac} vs={vs} />
        <Kpi label="Network / DC presences" value={totals.pres.toLocaleString()} delta={deltas.pres} vs={vs} />
      </div>

      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>{scopeName} landscape</h2>
          <span className="note rd-num">
            Baseline: {fmtDate(latest)} snapshot · deltas vs {fmtDate(prev)}
          </span>
        </div>
        <div className="rd-split">
          <Panel title="Metros by deployed capacity" tag={fmtMonth(latest)}>
            {metros.slice(0, 10).map((m, i) => (
              <Link className="rd-rowlink" key={m.metro} to={{ pathname: `/metro/${encodeURIComponent(m.metro)}`, search }}>
                <div className="rd-mrow">
                  <span className="rk rd-num">{i + 1}</span>
                  <span className="nm">
                    {m.metro} <span className="rd-cc">{m.country}</span>
                  </span>
                  <Bar pct={(m.capT / maxCap) * 100} />
                  <span className="vv rd-num">
                    <span className="t">
                      {m.capT.toFixed(1)}
                      <span className="x"> Tbps</span>
                    </span>
                    <span className="x">
                      {m.nets} nets · {m.ix} IX
                    </span>
                  </span>
                </div>
              </Link>
            ))}
          </Panel>
          <Panel title="Movers since last snapshot">
            <div className="rd-eyebrow" style={{ padding: "6px 11px 2px" }}>
              Metros · capacity added
            </div>
            {metroCapMovers.map((m) => (
              <div className="rd-mover" key={m.metro}>
                <span className="ic" style={{ background: "var(--present-bg)", color: "var(--present)" }}>
                  ▲
                </span>
                <span className="nm">{m.metro}</span>
                <span className="mv rd-up rd-num">+{m.dCapT.toFixed(1)} Tbps</span>
              </div>
            ))}
            <div className="rd-eyebrow" style={{ padding: "12px 11px 2px" }}>
              Networks · capacity change
            </div>
            {networkMovers.map((m) => {
              const up = m.dCapT >= 0;
              return (
                <Link className="rd-mover rd-rowlink" key={m.asn} to={{ pathname: `/net/${m.asn}`, search }}>
                  <span
                    className="ic"
                    style={{ background: up ? "var(--present-bg)" : "var(--gap-bg)", color: up ? "var(--present)" : "var(--gap)" }}
                  >
                    {up ? "▲" : "▼"}
                  </span>
                  <span className="nm">
                    {m.name}
                    <span>AS{m.asn}</span>
                  </span>
                  <span className={`mv rd-num ${up ? "rd-up" : "rd-down"}`}>
                    {up ? "+" : "−"}
                    {Math.abs(m.dCapT).toFixed(1)} Tbps
                  </span>
                </Link>
              );
            })}
          </Panel>
        </div>
      </div>

      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>Watchlist</h2>
          <div className="rd-watch-add" style={{ minWidth: 280 }}>
            <NetworkTypeahead options={dir} onPick={addWatch} exclude={new Set(watch)} placeholder="Pin a network — name or ASN…" />
          </div>
        </div>
        <Panel title={`Pinned networks — ${scopeName} footprint`} tag={fmtMonth(latest)}>
          <div className="rd-wl-head">
            <span>Network</span>
            <span className="c">Metros</span>
            <span className="c">Capacity</span>
            <span className="c">vs {vs}</span>
            <span />
          </div>
          {rows.map((r) => (
            <div className="rd-wl-row" key={r.asn}>
              <Link className="nm rd-netlink" to={{ pathname: `/net/${r.asn}`, search }}>
                {r.name}
                <span style={{ color: "var(--faint)", fontSize: 10.5, marginLeft: 6, fontWeight: 400 }}>AS{r.asn}</span>
              </Link>
              <span className="c rd-num">{r.found ? r.metros : "—"}</span>
              <span className="c rd-num" style={{ fontWeight: 700 }}>
                {r.found ? `${r.capT.toFixed(1)} T` : "not listed"}
              </span>
              <span className="c rd-num">{r.found ? <Delta value={Number(r.dCapT.toFixed(1))} unit=" T" /> : "—"}</span>
              <button className="rd-x" onClick={() => removeWatch(r.asn)} aria-label={`Remove AS${r.asn} from watchlist`}>
                ×
              </button>
            </div>
          ))}
          {!rows.length ? (
            <div style={{ padding: "14px 11px", color: "var(--muted)", fontSize: 12.5 }}>
              Pin the networks you track — they'll be summarized here after every monthly snapshot.
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
