import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { fetchPeeringDb } from "../peeringdbApi";
import { useSnapshot } from "./Shell";
import { Panel, Sparkline } from "./bits";
import { FacilityDirEntry, METRO_CODES, facilitiesDirectory, fmtMonth, networksDirectory, tokenMatch } from "./data";

/* Facilities directory — the data-centre twin of the Exchanges directory:
   every DC in scope with its operator, network count, trend and metro rank.
   Tick several and the compare matrix shows which networks sit in each,
   so you can read one network's presence across facilities at a glance. */

type SortKey = "nets" | "dnets" | "dnetsq" | "share" | "rank";
const GRID = "26px minmax(200px,1fr) 132px 96px 56px 64px 64px 66px 60px";
const MAX_COMPARE = 6;

const dLbl = (n: number) => (n === 0 ? "·" : `${n > 0 ? "+" : "−"}${Math.abs(n)}`);
const cls = (n: number) => (n > 0 ? "rd-up" : n < 0 ? "rd-down" : "rd-flat");

interface Member {
  asn: number;
  name: string;
  capT: number;
}

export default function FacilitiesPage() {
  const { data, scoped, derived, scopeName } = useSnapshot();
  const { latest } = derived;
  const { search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "nets", asc: false });

  const all = useMemo(() => facilitiesDirectory(scoped, latest), [scoped, latest]);
  const dirByAsn = useMemo(() => new Map(networksDirectory(data, latest).map((d) => [d.asn, d])), [data, latest]);

  /* ---- compare selection ----
     Held in local state so rapid toggles batch correctly (react-router's
     setSearchParams updater re-reads the current location each call, so
     several toggles in one tick would overwrite each other), then mirrored
     into ?facs= so a comparison stays shareable / deep-linkable. */
  const [picked, setPicked] = useState<number[]>(() =>
    (searchParams.get("facs") || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, MAX_COMPARE)
  );
  const toggle = (id: number) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, MAX_COMPARE)));
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (picked.length) next.set("facs", picked.join(","));
        else next.delete("facs");
        return next;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked.join(",")]);

  /* ---- live membership for the compared facilities ---- */
  const [members, setMembers] = useState<Record<number, { loading: boolean; asns: number[] }>>({});
  useEffect(() => {
    const missing = picked.filter((id) => !members[id]);
    if (!missing.length) return;
    let alive = true;
    setMembers((m) => {
      const n = { ...m };
      missing.forEach((id) => (n[id] = { loading: true, asns: [] }));
      return n;
    });
    fetchPeeringDb<any>("netfac", { fac_id__in: missing.join(","), all: 1 })
      .then((resp) => {
        if (!alive) return;
        const byFac = new Map<number, number[]>();
        missing.forEach((id) => byFac.set(id, []));
        for (const r of resp.data || []) {
          if (!r.local_asn) continue;
          const a = byFac.get(r.fac_id);
          if (a && !a.includes(r.local_asn)) a.push(r.local_asn);
        }
        setMembers((m) => {
          const n = { ...m };
          byFac.forEach((asns, id) => (n[id] = { loading: false, asns }));
          return n;
        });
      })
      .catch(() => {
        if (!alive) return;
        setMembers((m) => {
          const n = { ...m };
          missing.forEach((id) => (n[id] = { loading: false, asns: [] }));
          return n;
        });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked.join(",")]);

  const pickedRows = useMemo(
    () => picked.map((id) => all.find((f) => f.facilityId === id)).filter(Boolean) as FacilityDirEntry[],
    [picked, all]
  );
  const anyLoading = picked.some((id) => members[id]?.loading !== false);
  // union of networks across the compared facilities, biggest first
  const matrixNets = useMemo(() => {
    if (!picked.length || anyLoading) return [] as Member[];
    const seen = new Map<number, Member>();
    picked.forEach((id) =>
      (members[id]?.asns || []).forEach((asn) => {
        if (seen.has(asn)) return;
        const d = dirByAsn.get(asn);
        seen.set(asn, { asn, name: d?.name || `AS${asn}`, capT: d?.capT || 0 });
      })
    );
    return Array.from(seen.values()).sort((a, b) => b.capT - a.capT || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked.join(","), members, dirByAsn, anyLoading]);

  const filtered = useMemo(() => {
    const base = q.trim() ? all.filter((f) => tokenMatch(q, `${f.name} ${f.org} ${f.metro}`, f.facilityId)) : all;
    const val = (f: FacilityDirEntry) =>
      sort.key === "nets"
        ? f.nets
        : sort.key === "dnets"
        ? f.dNets
        : sort.key === "dnetsq"
        ? f.dNetsQ
        : sort.key === "share"
        ? f.metroSharePct
        : -f.metroRank;
    return [...base].sort((a, b) => (sort.asc ? val(a) - val(b) : val(b) - val(a)));
  }, [all, q, sort]);

  const Head = ({ k, label }: { k: SortKey; label: string }) => (
    <button className={`sort${sort.key === k ? " on" : ""}`} onClick={() => setSort((s) => ({ key: k, asc: s.key === k ? !s.asc : false }))}>
      {label} {sort.key === k ? (sort.asc ? "↑" : "↓") : ""}
    </button>
  );

  const inAll = (asn: number) => picked.every((id) => (members[id]?.asns || []).includes(asn));
  const inSome = (asn: number) => picked.some((id) => (members[id]?.asns || []).includes(asn));

  return (
    <>
      <div className="rd-slider-bar" style={{ alignItems: "center" }}>
        <div className="rd-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search data centres — names, operators or metros, several at once…"
            aria-label="Search data centres"
          />
        </div>
        <div className="rd-grow" />
        <span className="note rd-num">
          {q ? `${filtered.length} match` : `${all.length} data centres`} · {scopeName}
        </span>
      </div>

      {/* ---- compare matrix ---- */}
      {picked.length ? (
        <div className="rd-section">
          <div className="rd-sec-head">
            <h2>Compare presence · {picked.length} data centre{picked.length === 1 ? "" : "s"}</h2>
            <div className="rd-chips" style={{ marginBottom: 0 }}>
              {pickedRows.map((f) => (
                <button key={f.facilityId} className="rd-chip on" onClick={() => toggle(f.facilityId)} title="Remove">
                  {f.name.length > 22 ? `${f.name.slice(0, 21)}…` : f.name} ✕
                </button>
              ))}
              <button className="rd-chip" onClick={() => setPicked([])}>
                clear ✕
              </button>
            </div>
          </div>
          <div className="rd-heatwrap">
            {anyLoading ? (
              <div style={{ padding: "18px 12px", color: "var(--muted)", fontSize: 13 }}>Fetching membership from PeeringDB…</div>
            ) : (
              <table className="rd-amx compact">
                <thead>
                  <tr>
                    <th className="who">Network</th>
                    {pickedRows.map((f) => (
                      <th key={f.facilityId} className={`fac${f.isEquinix ? " eqx" : ""}`} title={`${f.name} · ${f.org} · ${f.metro}`}>
                        <Link to={{ pathname: `/fac/${f.facilityId}`, search }}>{f.name}</Link>
                        <span className="mx">
                          {METRO_CODES[f.metro] || f.metro} · {f.nets}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixNets.slice(0, 60).map((n) => (
                    <tr key={n.asn}>
                      <td className="who">
                        <Link to={{ pathname: `/net/${n.asn}`, search }} className="nm rd-netlink">
                          {n.name.length > 24 ? `${n.name.slice(0, 23)}…` : n.name}
                        </Link>
                        <span className="sub rd-num">{n.capT >= 0.05 ? `${n.capT.toFixed(1)}T` : `AS${n.asn}`}</span>
                      </td>
                      {pickedRows.map((f) => {
                        const on = (members[f.facilityId]?.asns || []).includes(n.asn);
                        return (
                          <td key={f.facilityId} className={`cell dot${on ? (f.isEquinix ? " on eqx" : " on") : ""}`}>
                            {on ? "✓" : "·"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {!anyLoading ? (
            <div className="rd-footnote" style={{ marginTop: 8 }}>
              {matrixNets.length.toLocaleString()} networks across these data centres
              {picked.length > 1 ? <> · {matrixNets.filter((n) => inAll(n.asn)).length} in all of them</> : null}
              {picked.length > 1 ? <> · {matrixNets.filter((n) => inSome(n.asn) && !inAll(n.asn)).length} in some</> : null}
              {matrixNets.length > 60 ? " · showing the 60 largest" : ""}. Membership is live from PeeringDB; ordering by
              each network's deployed capacity.
            </div>
          ) : null}
        </div>
      ) : null}

      <Panel title={q ? "Search results" : "Data centres by network presence"} tag={fmtMonth(latest)}>
        <div className="rd-dirhead" style={{ gridTemplateColumns: GRID }}>
          <span />
          <span>Data centre</span>
          <span>Operator</span>
          <span>Metro</span>
          <span className="c">Trend</span>
          <span className="c">
            <Head k="nets" label="Networks" />
          </span>
          <span className="c">
            <Head k="dnets" label="Δ MoM" />
          </span>
          <span className="c">
            <Head k="share" label="Metro share" />
          </span>
          <span className="c">
            <Head k="rank" label="Rank" />
          </span>
        </div>
        {filtered.slice(0, 60).map((f, i) => {
          const on = picked.includes(f.facilityId);
          return (
            <div key={f.facilityId} className={`rd-dirrow facts rd-facrow${f.isEquinix ? " eqxrow" : ""}${on ? " picked" : ""}`} style={{ gridTemplateColumns: GRID }}>
              <button
                className="rd-pickbox"
                onClick={() => toggle(f.facilityId)}
                disabled={!on && picked.length >= MAX_COMPARE}
                title={on ? "Remove from comparison" : picked.length >= MAX_COMPARE ? `Compare up to ${MAX_COMPARE}` : "Add to comparison"}
                aria-label={on ? "Remove from comparison" : "Add to comparison"}
              >
                {on ? "✓" : "+"}
              </button>
              <Link to={{ pathname: `/fac/${f.facilityId}`, search }} className="nm rd-netlink" style={f.isEquinix ? { color: "var(--equinix)" } : undefined} title={f.name}>
                {f.name.length > 30 ? `${f.name.slice(0, 29)}…` : f.name}
              </Link>
              <span className="meta" title={f.org}>
                {f.isEquinix ? "Equinix" : f.org.length > 18 ? `${f.org.slice(0, 17)}…` : f.org}
              </span>
              <span className="meta">
                {f.metro} <span className="rd-cc">{METRO_CODES[f.metro] || ""}</span>
              </span>
              <span className="spk">{f.nets > 0 ? <Sparkline points={f.spark} width={50} height={20} /> : null}</span>
              <span className="pv rd-num">{f.nets.toLocaleString()}</span>
              <span className={`pv rd-num ${cls(f.dNets)}`} title={`QoQ ${dLbl(f.dNetsQ)}`}>
                {dLbl(f.dNets)}
              </span>
              <span className="pv rd-num">{f.metroSharePct.toFixed(1)}%</span>
              <span className="meta rd-num">#{f.metroRank}</span>
            </div>
          );
        })}
        {!filtered.length ? <div style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 13 }}>No data centres match “{q}”.</div> : null}
        {filtered.length > 60 ? (
          <div style={{ padding: "12px 12px", color: "var(--faint)", fontSize: 12 }}>
            Showing top 60 of {filtered.length.toLocaleString()} — refine your search to narrow.
          </div>
        ) : null}
      </Panel>
      <div className="rd-footnote">
        Tick the <b>+</b> on up to {MAX_COMPARE} data centres to compare who's racked where — the matrix above shows each
        network against the selected facilities, so you can see at a glance who is in one and not the other. Click a
        column to sort; a name for the data-centre profile. Network counts, trend and metro rank are snapshot-based
        ({fmtMonth(latest)}); the comparison membership is fetched live from PeeringDB.
      </div>
    </>
  );
}
