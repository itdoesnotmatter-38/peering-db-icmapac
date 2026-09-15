import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchPeeringDb } from "../peeringdbApi";
import { useSnapshot } from "./Shell";
import { Bar, Kpi, Panel, PeriodBar } from "./bits";
import { METRO_CODES, facilityMemberHistory, facilityProfile, fmtMonth, networksDirectory } from "./data";
import { usePeriod } from "./usePeriod";

/* Data-centre (facility) deep dive. Snapshot-based for the network-count
   trend and metro context; the member networks come live from netfac,
   enriched with each network's deployed capacity so the biggest tenants
   surface first. */

interface Member {
  asn: number;
  name: string;
  capT: number;
}

export default function FacilityPage() {
  const { data, derived, asOf } = useSnapshot();
  const { facId } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const latest = derived.latest;

  const p = useMemo(() => facilityProfile(data, Number(facId), asOf), [data, facId, asOf]);
  const dirByAsn = useMemo(() => new Map(networksDirectory(data, latest).map((d) => [d.asn, d])), [data, latest]);

  /* network movement in and out of this data centre, over a chosen period
     (snapshot-based; opens on the latest month) */
  const memberHist = useMemo(() => facilityMemberHistory(data, Number(facId), asOf), [data, facId, asOf]);
  const period = usePeriod(memberHist.snaps.length, "last");
  const [showAllMoves, setShowAllMoves] = useState(false);
  const moves = useMemo(() => {
    const { from, to } = period;
    const cap = (asn: number) => dirByAsn.get(asn)?.capT || 0;
    const bySize = (a: { asn: number; name: string }, b: { asn: number; name: string }) => cap(b.asn) - cap(a.asn) || a.name.localeCompare(b.name);
    const rows = memberHist.rows;
    return {
      joined: rows.filter((r) => !r.present[from] && r.present[to]).sort(bySize),
      left: rows.filter((r) => r.present[from] && !r.present[to]).sort(bySize),
      atFrom: rows.filter((r) => r.present[from]).length,
      atTo: rows.filter((r) => r.present[to]).length,
      // joins / exits for every month-on-month step, for the timeline strip
      steps: memberHist.snaps.map((_, i) =>
        i === 0
          ? null
          : {
              joined: rows.filter((r) => !r.present[i - 1] && r.present[i]).length,
              left: rows.filter((r) => r.present[i - 1] && !r.present[i]).length,
            }
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberHist, period.from, period.to, dirByAsn]);
  const moveLabels = memberHist.snaps.map((d) => fmtMonth(d));

  const [members, setMembers] = useState<{ loading: boolean; rows: Member[]; error: string | null }>({
    loading: false,
    rows: [],
    error: null,
  });

  useEffect(() => {
    if (!p.found) return;
    let alive = true;
    setMembers({ loading: true, rows: [], error: null });
    fetchPeeringDb<any>("netfac", { fac_id: p.facId, all: 1 })
      .then((resp) => {
        if (!alive) return;
        const seen = new Set<number>();
        const rows: Member[] = [];
        for (const r of resp.data || []) {
          const asn = r.local_asn;
          if (!asn || seen.has(asn)) continue;
          seen.add(asn);
          const d = dirByAsn.get(asn);
          rows.push({ asn, name: d?.name || `AS${asn}`, capT: d?.capT || 0 });
        }
        rows.sort((a, b) => b.capT - a.capT || a.name.localeCompare(b.name));
        setMembers({ loading: false, rows, error: null });
      })
      .catch((e) => alive && setMembers({ loading: false, rows: [], error: e?.message || "Fetch failed" }));
    return () => {
      alive = false;
    };
  }, [p, dirByAsn]);

  if (!p.found) {
    return (
      <div className="rd-center">
        <h3>Data centre not in snapshots</h3>
        <p>No snapshot data for facility id {facId}. It may be outside APAC or not listed.</p>
        <button className="rd-btn" onClick={() => navigate(-1)}>
          Go back
        </button>
      </div>
    );
  }

  const prev = p.snapshots.length > 1 ? p.snapshots[p.snapshots.length - 2] : latest;
  const maxCap = members.rows[0]?.capT || 1;

  return (
    <>
      <Link className="rd-crumb" to={{ pathname: `/metro/${encodeURIComponent(p.metro)}`, search }}>
        ← {p.metro}
      </Link>

      <div className="rd-xhead">
        <h1>{p.name}</h1>
        {p.isEquinix ? <span className="rd-badge-eqx">Equinix</span> : null}
        <span className="rd-cc" style={{ fontSize: 11, padding: "3px 8px" }} title="Operator">
          {p.org}
        </span>
        <Link to={{ pathname: `/metro/${encodeURIComponent(p.metro)}`, search }} className="rd-cc" style={{ fontSize: 11, padding: "3px 8px" }}>
          {p.metro} {METRO_CODES[p.metro] ? `· ${METRO_CODES[p.metro]}` : ""}
        </Link>
      </div>

      <div className="rd-kpis four">
        <Kpi
          label="Networks present"
          value={String(p.netCount)}
          delta={p.dNet}
          vs={fmtMonth(prev)}
          spark={p.netSeries}
        />
        <Kpi label={`Rank in ${p.metro}`} value={`#${p.metroRank}`} deltaNode={<span className="rd-flat">of {p.metroFacCount} data centres</span>} />
        <Kpi label={`Share of ${p.metro} DC presence`} value={p.metroSharePct.toFixed(1)} unit="%" deltaNode={<span className="rd-flat">of all network presences</span>} />
        <Kpi label="Operator" value={p.isEquinix ? "Equinix" : p.org.length > 14 ? `${p.org.slice(0, 13)}…` : p.org} deltaNode={<span className="rd-flat">facility owner</span>} />
      </div>

      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>Network movement</h2>
          <span className="note">Snapshot-based · which networks joined or left {p.name}</span>
        </div>
        {!memberHist.available ? (
          <div className="rd-footnote">Movement history isn't in the loaded data yet — refresh in a few minutes.</div>
        ) : memberHist.snaps.length < 2 ? (
          <div className="rd-footnote">Movement needs at least two snapshots.</div>
        ) : (
          <>
            <PeriodBar
              labels={moveLabels}
              from={period.from}
              to={period.to}
              onChange={period.set}
              presets={[
                { label: "Last month", onClick: period.lastMonth, active: period.from === memberHist.snaps.length - 2 && period.to === memberHist.snaps.length - 1 },
                { label: "Last quarter", onClick: period.lastQuarter },
                { label: "All time", onClick: period.allTime },
              ]}
            >
              <div style={{ textAlign: "right" }}>
                <div className="rd-eyebrow">Net over period</div>
                <div
                  className={`rd-num ${moves.atTo > moves.atFrom ? "rd-up" : moves.atTo < moves.atFrom ? "rd-down" : "rd-flat"}`}
                  style={{ fontSize: 18, fontWeight: 700 }}
                >
                  {moves.atTo === moves.atFrom ? "no change" : `${moves.atTo > moves.atFrom ? "+" : "−"}${Math.abs(moves.atTo - moves.atFrom)} networks`}
                </div>
              </div>
            </PeriodBar>

            <div className="rd-movegrid three">
              {([
                ["Joined", moves.joined, "join"],
                ["Left", moves.left, "gone"],
              ] as Array<[string, typeof moves.joined, string]>).map(([label, list, kind]) => (
                <div key={label} className={`rd-movecard ${kind}`}>
                  <div className="hd">
                    <span className="lb">{label}</span>
                    <span className="ct rd-num">{list.length}</span>
                  </div>
                  {list.length ? (
                    (showAllMoves ? list : list.slice(0, 8)).map((r) => {
                      const capT = dirByAsn.get(r.asn)?.capT || 0;
                      return (
                        <Link key={r.asn} to={{ pathname: `/net/${r.asn}`, search }} className="row">
                          <span className="nm">{r.name.length > 28 ? `${r.name.slice(0, 27)}…` : r.name}</span>
                          <span className="mt">AS{r.asn}</span>
                          <span className="dv rd-num">{capT >= 0.05 ? `${capT.toFixed(1)}T` : ""}</span>
                        </Link>
                      );
                    })
                  ) : (
                    <div className="none">Nothing in this period</div>
                  )}
                  {list.length > 8 ? (
                    <button className="none rd-linkbtn" onClick={() => setShowAllMoves((v) => !v)}>
                      {showAllMoves ? "show fewer" : `+${list.length - 8} more`}
                    </button>
                  ) : null}
                </div>
              ))}
              <div className="rd-movecard">
                <div className="hd">
                  <span className="lb">Networks listed</span>
                  <span className="ct rd-num">{moves.atTo}</span>
                </div>
                <div className="none" style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {moves.atFrom} at {moveLabels[period.from]} → <b style={{ color: "var(--text)" }}>{moves.atTo}</b> at {moveLabels[period.to]}
                </div>
                <div className="rd-stepstrip">
                  {moves.steps.map((st, i) =>
                    st ? (
                      <div key={i} className={`st${i > period.from && i <= period.to ? "" : " out"}`} title={`${moveLabels[i - 1]} → ${moveLabels[i]}`}>
                        <span className="m">{moveLabels[i]}</span>
                        <span className="rd-up rd-num">+{st.joined}</span>
                        <span className="rd-down rd-num">−{st.left}</span>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            </div>
            <div className="rd-footnote" style={{ marginBottom: 22 }}>
              Built from the monthly snapshots: a network <b>joined</b> if it wasn't listed here at the start of the period
              and is at the end, and <b>left</b> the reverse. Largest networks by deployed IX capacity first. The strip
              shows joins and exits for each month; months outside the period are dimmed. The live member list below comes
              straight from PeeringDB and can differ slightly from the latest snapshot.
            </div>
          </>
        )}
      </div>

      <div className="rd-section">
        <div className="rd-sec-head">
          <h2>Networks in this data centre</h2>
          <span className="note rd-num">
            {members.loading ? "fetching live from PeeringDB…" : `${members.rows.length} listed · largest first`}
          </span>
        </div>
        <Panel title={`Members of ${p.name}`} tag={p.isEquinix ? "Equinix" : p.org}>
          {members.loading ? (
            <div style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 13 }}>Loading members from PeeringDB…</div>
          ) : members.error ? (
            <div style={{ padding: "16px 12px", color: "var(--gap)", fontSize: 13 }}>Couldn't load members: {members.error}</div>
          ) : members.rows.length ? (
            members.rows.slice(0, 40).map((m) => (
              <Link key={m.asn} to={{ pathname: `/net/${m.asn}`, search }} className="rd-rowlink">
                <div className="rd-shrow" style={{ gridTemplateColumns: "230px 1fr 96px" }}>
                  <span className="nm">
                    {m.name.length > 28 ? `${m.name.slice(0, 27)}…` : m.name}
                    <span className="rd-cc" style={{ marginLeft: 7 }}>
                      AS{m.asn}
                    </span>
                  </span>
                  <Bar pct={(m.capT / maxCap) * 100} color={p.isEquinix ? "var(--equinix)" : "var(--accent)"} />
                  <span className="fr rd-num" style={{ fontWeight: 700, color: "var(--text)" }}>
                    {m.capT >= 0.05 ? `${m.capT.toFixed(1)} T` : "—"}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 13 }}>No networks list this data centre.</div>
          )}
          {members.rows.length > 40 ? (
            <div style={{ padding: "10px 12px", color: "var(--faint)", fontSize: 12 }}>Showing the 40 largest of {members.rows.length}.</div>
          ) : null}
        </Panel>
        <div className="rd-footnote">
          Network count and metro rank are snapshot-based ({fmtMonth(latest)}); the member list is fetched live from
          PeeringDB (netfac) and each network's capacity is its total deployed IX capacity from the snapshot. Bar length is
          relative to the largest tenant here. Presence means a listed PeeringDB record, not certain live equipment.
        </div>
      </div>
    </>
  );
}
