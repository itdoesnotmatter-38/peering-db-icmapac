import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchPeeringDb } from "../peeringdbApi";
import { useSnapshot } from "./Shell";
import { Bar, Kpi, Panel } from "./bits";
import { METRO_CODES, facilityProfile, fmtMonth, networksDirectory } from "./data";

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
