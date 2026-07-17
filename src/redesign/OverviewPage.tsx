import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Bar, Delta, Kpi, NetworkTypeahead, Panel } from "./bits";
import { fmtDate, fmtMonth, loadWatchlist, networksDirectory, saveWatchlist, watchRows } from "./data";

/* Overview — the consolidated state-of-the-market landing page:
   totals → computed insights → the metro landscape → Equinix share
   position → your watchlist. (Absorbed the old Insights and Market
   share pages.) */

export default function OverviewPage() {
  const { scoped, derived, scopeName } = useSnapshot();
  const { search } = useLocation();
  const { totals, deltas, capSeries, netSeries, metros, latest, prev, snapshots, share, insights } = derived;
  const vs = fmtMonth(prev);
  const since = fmtMonth(snapshots[0]);

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

  /* ---- share callout ---- */
  const apacDelta = share.apacSeries[share.apacSeries.length - 1] - share.apacSeries[0];
  const ppNode = (v: number) => (
    <span className={`rd-num ${v > 0 ? "rd-up" : v < 0 ? "rd-down" : "rd-flat"}`}>
      {v > 0 ? "▲" : v < 0 ? "▼" : "—"} {v > 0 ? "+" : "−"}
      {Math.abs(v).toFixed(1)} pp
    </span>
  );
  const shareOf = (metro: string) => share.byMetro.find((s) => s.metro === metro)?.pct ?? 0;
  const thin = [...metros].sort((a, b) => b.dCapT - a.dCapT).find((m) => shareOf(m.metro) < 15);
  const strong = share.byMetro[0];

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

      {/* ---- insights (absorbed from the Insights page) ---- */}
      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>{fmtMonth(latest)} insights</h2>
          <span className="note rd-num">
            Computed from the {fmtDate(prev)} → {fmtDate(latest)} snapshots — biggest movers, presence gaps, concentration
          </span>
        </div>
        <div className="rd-igrid">
          {insights.map((card, i) => (
            <div className="rd-icard" key={i}>
              <span className={`rd-icat ${card.cat}`}>{card.catLabel}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              {card.bars ? (
                <div className="rd-ibars">
                  {card.bars.map((b, j) => (
                    <div className="rd-ibar" key={j}>
                      <span className="l">{b.label}</span>
                      <Bar pct={(b.value / (b.max || 1)) * 100} color={b.color} />
                      <span className="v rd-num">{b.text}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {card.list ? (
                <div className="rd-ilist">
                  {card.list.map((r, j) =>
                    r.asn ? (
                      <Link className="rd-irow rd-netlink" key={j} to={{ pathname: `/net/${r.asn}`, search }} style={{ textDecoration: "none" }}>
                        <span className="nm">{r.name}</span>
                        {r.sub ? <span className="as2 rd-num">{r.sub}</span> : null}
                        <span className={`amt rd-num${r.neg ? " neg" : ""}`}>{r.amount}</span>
                      </Link>
                    ) : (
                      <div className="rd-irow" key={j}>
                        <span className="nm">{r.name}</span>
                        {r.sub ? <span className="as2 rd-num">{r.sub}</span> : null}
                        <span className={`amt rd-num${r.neg ? " neg" : ""}`}>{r.amount}</span>
                      </div>
                    )
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* ---- metro landscape ---- */}
      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>{scopeName} landscape</h2>
          <span className="note rd-num">
            Baseline: {fmtDate(latest)} snapshot · deltas vs {fmtDate(prev)}
          </span>
        </div>
        <Panel title="Metros by deployed capacity" tag={fmtMonth(latest)}>
          {metros.slice(0, 12).map((m, i) => (
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
      </div>

      {/* ---- Equinix share position (absorbed from the Market share page) ---- */}
      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>Equinix share</h2>
          <span className="note">Violet = Equinix · share of PeeringDB-visible interconnection</span>
        </div>
        <div className="rd-kpis four">
          <Kpi
            label={`${scopeName} IX-capacity share`}
            value={share.apacPct.toFixed(1)}
            unit="%"
            deltaNode={
              <>
                {ppNode(apacDelta)} <span className="rd-flat">since {since}</span>
              </>
            }
            spark={share.apacSeries}
          />
          {share.metroSeries.map((m) => (
            <Kpi
              key={m.metro}
              label={`${m.metro} share`}
              value={m.pct.toFixed(1)}
              unit="%"
              deltaNode={
                <>
                  {ppNode(m.dPP)} <span className="rd-flat">since {since}</span>
                </>
              }
              spark={m.series}
            />
          ))}
          <Kpi
            label={`DC-presence share · ${scopeName}`}
            value={share.dcPct.toFixed(1)}
            unit="%"
            deltaNode={<span className="rd-up">{share.dcRankNote || "—"}</span>}
          />
        </div>
        <div className="rd-split">
          <Panel title="Equinix share of IX deployed capacity, by metro" tag={fmtMonth(latest)}>
            {share.byMetro.map((s) => (
              <div className="rd-shrow" key={s.metro}>
                <span className="nm">{s.metro}</span>
                <Bar pct={s.pct} color="var(--equinix)" />
                <span className="pv rd-num">{s.pct.toFixed(1)}%</span>
                <span className="fr rd-num">
                  {s.eqxT.toFixed(1)} / {s.totT.toFixed(1)} T
                </span>
              </div>
            ))}
          </Panel>
          <Panel title="Facility operators — share of network presences" tag={scopeName}>
            {share.operators.map((o) => (
              <div className={`rd-shrow${o.isEquinix ? " eqxrow" : ""}`} key={o.org}>
                <span className="nm" style={o.isEquinix ? { color: "var(--equinix)" } : undefined} title={o.org}>
                  {o.org.length > 22 ? `${o.org.slice(0, 21)}…` : o.org}
                </span>
                <Bar pct={(o.pct / (share.operators[0]?.pct || 1)) * 100} color={o.isEquinix ? "var(--equinix)" : "var(--border-strong)"} />
                <span className="pv rd-num">{o.pct.toFixed(1)}%</span>
                <span className="fr rd-num">{o.presences.toLocaleString()} presences</span>
              </div>
            ))}
          </Panel>
        </div>
        {thin && strong ? (
          <div className="rd-banner" style={{ marginTop: 18 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            <div>
              <b>Growth is where share is thinnest.</b> {thin.metro} added the most capacity this month (+
              {thin.dCapT.toFixed(1)} Tbps) but Equinix holds {shareOf(thin.metro).toFixed(1)}% there — against{" "}
              {strong.pct.toFixed(1)}% in {strong.metro}. {scopeName} share moved {apacDelta >= 0 ? "+" : ""}
              {apacDelta.toFixed(1)} pp since {since}.
            </div>
          </div>
        ) : null}
        <div className="rd-footnote">
          Method: "IX-capacity share" = deployed capacity on Equinix-named exchanges ÷ all listed IX capacity in the
          metro. "DC-presence share" = network–facility presences in Equinix facilities ÷ all listed presences. PeeringDB
          is self-reported and excludes private interconnection — read this as <b>visibility share, not revenue share</b>.
        </div>
      </div>

      {/* ---- watchlist ---- */}
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
