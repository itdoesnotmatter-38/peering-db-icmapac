import React, { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Bar, Kpi, Panel } from "./bits";
import { ExchangeMove, exchangeProfile, fmtMonth } from "./data";

/* Snapshot-based profile of a single exchange: capacity, members,
   movement, and the competitive gap list against its metro rivals.
   Always computed from the UNFILTERED dataset — an exchange makes
   sense only in its full metro context. */

export default function ExchangePage() {
  const { data } = useSnapshot();
  const { ixId } = useParams();
  const { search } = useLocation();

  const profile = useMemo(() => exchangeProfile(data, Number(ixId)), [data, ixId]);

  if (!profile) {
    return (
      <div className="rd-center">
        <h3>Exchange not found</h3>
        <p>No snapshot data for IX id {ixId}.</p>
        <Link className="rd-btn" to={{ pathname: "/share", search }}>
          Back to Market share
        </Link>
      </div>
    );
  }

  const p = profile;
  const latest = p.snapshots[p.snapshots.length - 1];
  const prev = p.snapshots.length > 1 ? p.snapshots[p.snapshots.length - 2] : latest;
  const dCap = p.capSeries[p.capSeries.length - 1] - (p.capSeries[p.capSeries.length - 2] ?? p.capSeries[p.capSeries.length - 1]);
  const dNets = p.netSeries[p.netSeries.length - 1] - (p.netSeries[p.netSeries.length - 2] ?? p.netSeries[p.netSeries.length - 1]);

  const moveList = (rows: ExchangeMove[], mode: "join" | "leave" | "upgrade", empty: string) =>
    rows.length ? (
      rows.slice(0, 6).map((r) => (
        <div className="rd-mover" key={`${mode}-${r.asn}`}>
          <span
            className="ic"
            style={{
              background: mode === "leave" ? "var(--gap-bg)" : mode === "join" ? "var(--present-bg)" : "var(--accent-soft)",
              color: mode === "leave" ? "var(--gap)" : mode === "join" ? "var(--present)" : "var(--accent)",
            }}
          >
            {mode === "leave" ? "▼" : "▲"}
          </span>
          <span className="nm">
            {r.name}
            <span>AS{r.asn}</span>
          </span>
          <span className="mv rd-num" style={{ color: "var(--muted)" }}>
            {mode === "upgrade" ? `${(r.fromG || 0).toFixed(0)}G → ${(r.toG || 0).toFixed(0)}G` : r.capG >= 1 ? `${r.capG.toFixed(0)}G` : "—"}
          </span>
        </div>
      ))
    ) : (
      <div style={{ padding: "10px 11px", color: "var(--muted)", fontSize: 12.5 }}>{empty}</div>
    );

  return (
    <>
      <Link className="rd-crumb" to={{ pathname: "/share", search }}>
        ← Market share
      </Link>

      <div className="rd-xhead">
        <h1>{p.name}</h1>
        {p.isEquinix ? <span className="rd-badge-eqx">Equinix</span> : null}
        <span className="rd-cc" style={{ fontSize: 11, padding: "3px 8px" }}>
          {p.metro}
        </span>
      </div>

      <div className="rd-kpis four">
        <Kpi label="Deployed capacity" value={p.capT.toFixed(1)} unit="Tbps" delta={Number(dCap.toFixed(1))} deltaUnit=" T" vs={fmtMonth(prev)} spark={p.capSeries} />
        <Kpi label="Member networks" value={String(p.nets)} delta={dNets} vs={fmtMonth(prev)} spark={p.netSeries} />
        <Kpi label={`Share of ${p.metro} IX capacity`} value={p.shareOfMetroPct.toFixed(1)} unit="%" deltaNode={<span className="rd-flat">across {p.metroIxCount} exchanges</span>} />
        <Kpi label={`Rank in ${p.metro}`} value={`#${p.metroRank}`} deltaNode={<span className="rd-flat">by deployed capacity</span>} />
      </div>

      <div className="rd-section">
        <div className="rd-split">
          <Panel title="Members by port capacity" tag={`top 12 of ${p.memberCount}`}>
            {p.members.slice(0, 12).map((m) => (
              <div className="rd-shrow" key={m.asn} style={{ gridTemplateColumns: "210px 1fr 90px" }}>
                <span className="nm">
                  {m.name.length > 26 ? `${m.name.slice(0, 25)}…` : m.name}
                  <span className="rd-cc" style={{ marginLeft: 7 }}>
                    AS{m.asn}
                  </span>
                </span>
                <Bar pct={(m.capG / (p.members[0]?.capG || 1)) * 100} color={p.isEquinix ? "var(--equinix)" : "var(--accent)"} />
                <span className="fr rd-num" style={{ fontWeight: 700, color: "var(--text)" }}>
                  {m.capG >= 1000 ? `${(m.capG / 1000).toFixed(1)} T` : `${m.capG.toFixed(0)} G`}
                </span>
              </div>
            ))}
          </Panel>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Panel title={`Movement in ${fmtMonth(latest)}`} tag={`+${p.joined.length} · −${p.left.length} · ↑${p.upgraded.length}`}>
              <div className="rd-eyebrow" style={{ padding: "6px 11px 2px" }}>
                Joined
              </div>
              {moveList(p.joined, "join", "No new members this month.")}
              <div className="rd-eyebrow" style={{ padding: "10px 11px 2px" }}>
                Port upgrades
              </div>
              {moveList(p.upgraded, "upgrade", "No ≥100G upgrades this month.")}
              <div className="rd-eyebrow" style={{ padding: "10px 11px 2px" }}>
                Left
              </div>
              {moveList(p.left, "leave", "No departures this month.")}
            </Panel>
          </div>
        </div>
      </div>

      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>On other {p.metro} exchanges — not here</h2>
          <span className="note">
            Ranked by their total port capacity elsewhere in {p.metro} — {p.isEquinix ? "the prospect shortlist" : "what this exchange is missing"}
          </span>
        </div>
        <Panel title={`Top ${p.rivalsNotHere.length} networks absent from ${p.name}`} tag={p.metro}>
          {p.rivalsNotHere.map((r) => (
            <div className="rd-dumb" key={r.asn} style={{ gridTemplateColumns: "1fr 210px 150px" }}>
              <span className="who">
                <span className="n">{r.name}</span>
                <span className="w rd-num">AS{r.asn} · largest port: {r.bestRivalIx}</span>
              </span>
              <span className="rd-bar">
                <i
                  style={{
                    width: `${(r.totalRivalG / (p.rivalsNotHere[0]?.totalRivalG || 1)) * 100}%`,
                    background: "var(--gap)",
                  }}
                />
              </span>
              <span className="amt rd-num">
                {r.totalRivalG >= 1000 ? `${(r.totalRivalG / 1000).toFixed(1)} T` : `${r.totalRivalG.toFixed(0)} G`} elsewhere
              </span>
            </div>
          ))}
          {!p.rivalsNotHere.length ? (
            <div style={{ padding: "12px 11px", color: "var(--muted)", fontSize: 12.5 }}>
              Every network on {p.metro}'s other exchanges is already a member here.
            </div>
          ) : null}
        </Panel>
        <div className="rd-footnote">
          Snapshot-based ({fmtMonth(latest)}). Port sizes are PeeringDB self-reported; membership means a listed
          netixlan record, not necessarily live traffic. With {p.snapshots.length} snapshots of history the join/leave
          feed is still noisy at small exchanges — it firms up every month.
        </div>
      </div>
    </>
  );
}
