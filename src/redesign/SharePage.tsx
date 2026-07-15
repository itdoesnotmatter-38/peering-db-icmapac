import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Bar, Kpi, Panel } from "./bits";
import { exchangesRanking, fmtMonth } from "./data";

export default function SharePage() {
  const { scoped, derived, scopeName } = useSnapshot();
  const { share, metros, latest, snapshots } = derived;
  const since = fmtMonth(snapshots[0]);
  const { search } = useLocation();
  const exchanges = useMemo(() => exchangesRanking(scoped, latest), [scoped, latest]);

  const apacDelta = share.apacSeries[share.apacSeries.length - 1] - share.apacSeries[0];
  const ppNode = (v: number) => (
    <span className={`rd-num ${v > 0 ? "rd-up" : v < 0 ? "rd-down" : "rd-flat"}`}>
      {v > 0 ? "▲" : v < 0 ? "▼" : "—"} {v > 0 ? "+" : "−"}
      {Math.abs(v).toFixed(1)} pp
    </span>
  );

  /* growth-vs-share callout: biggest capacity gainer where Equinix share < 15% */
  const shareOf = (metro: string) => share.byMetro.find((s) => s.metro === metro)?.pct ?? 0;
  const thin = [...metros].sort((a, b) => b.dCapT - a.dCapT).find((m) => shareOf(m.metro) < 15);
  const strong = share.byMetro[0];

  return (
    <>
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

      <div className="rd-sec-head">
        <h2>Where the share sits</h2>
        <span className="note">Violet = Equinix · share of PeeringDB-visible interconnection</span>
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

      <div className="rd-section" style={{ marginTop: 24 }}>
        <div className="rd-sec-head">
          <h2>Exchanges in scope</h2>
          <span className="note">Click an exchange for its full profile — members, movement, and competitive gaps</span>
        </div>
        <Panel title={`${exchanges.length} exchanges, by deployed capacity`} tag={scopeName}>
          {exchanges.slice(0, 12).map((x) => (
            <Link key={x.ixId} to={{ pathname: `/exchange/${x.ixId}`, search }} className="rd-rowlink">
              <div className={`rd-shrow${x.isEquinix ? " eqxrow" : ""}`} style={{ gridTemplateColumns: "210px 1fr 54px 120px" }}>
                <span className="nm" style={x.isEquinix ? { color: "var(--equinix)" } : undefined}>
                  {x.name.length > 28 ? `${x.name.slice(0, 27)}…` : x.name}
                  <span className="rd-cc" style={{ marginLeft: 7 }}>
                    {x.metro}
                  </span>
                </span>
                <Bar pct={(x.capT / (exchanges[0]?.capT || 1)) * 100} color={x.isEquinix ? "var(--equinix)" : "var(--border-strong)"} />
                <span className="pv rd-num">{x.pctOfScope.toFixed(1)}%</span>
                <span className="fr rd-num">
                  {x.capT.toFixed(1)} T · {x.nets} nets
                </span>
              </div>
            </Link>
          ))}
        </Panel>
      </div>

      {thin && strong ? (
        <div className="rd-banner" style={{ marginTop: 22 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <div>
            <b>Growth is where share is thinnest.</b> {thin.metro} added the most capacity this month (+
            {thin.dCapT.toFixed(1)} Tbps) but Equinix holds {shareOf(thin.metro).toFixed(1)}% there — against{" "}
            {strong.pct.toFixed(1)}% in {strong.metro}. APAC share moved {apacDelta >= 0 ? "+" : ""}
            {apacDelta.toFixed(1)} pp since {since}.
          </div>
        </div>
      ) : null}

      <div className="rd-footnote">
        Method: "IX-capacity share" = deployed capacity on Equinix-named exchanges ÷ all listed IX capacity in the
        metro. "DC-presence share" = network–facility presences in Equinix facilities ÷ all listed presences. PeeringDB
        is self-reported and excludes private interconnection — read this as <b>visibility share, not revenue share</b>.
      </div>
    </>
  );
}
