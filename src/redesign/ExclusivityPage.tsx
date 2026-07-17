import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchPeeringDb } from "../peeringdbApi";
import { useSnapshot } from "./Shell";
import { Bar } from "./bits";
import {
  ExclusiveNet,
  METRO_CODES,
  facilitiesRanking,
  filterByMetros,
  fmtMonth,
  ixExclusivesByMetro,
  networksDirectory,
} from "./data";

/* Exclusivity — per metro, the networks reachable at ONLY ONE exchange or
   data centre in that market. An exchange's exclusives are the members a
   customer cannot peer with anywhere else in the metro (the stickiness /
   battlecard number); a competitor's exclusives are what you're missing.
   IX side is snapshot-based (follows the time slider); DC side is live
   from netfac, since the snapshot only carries facility aggregates. */

interface FacExRow {
  facId: number;
  name: string;
  org: string;
  isEquinix: boolean;
  members: number;
  exclusives: ExclusiveNet[];
}

const gLbl = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(1)} T` : g >= 0.5 ? `${g.toFixed(0)} G` : "—");

export default function ExclusivityPage() {
  const { data, scoped, derived, scopeName } = useSnapshot();
  const { latest } = derived;
  const { search } = useLocation();

  const ixEx = useMemo(() => ixExclusivesByMetro(scoped, latest), [scoped, latest]);
  const metros = useMemo(() => derived.metros.map((m) => m.metro).filter((m) => ixEx.has(m)), [derived.metros, ixEx]);
  const dirByAsn = useMemo(() => new Map(networksDirectory(data, latest).map((d) => [d.asn, d])), [data, latest]);
  const facMetaByMetro = useMemo(
    () => new Map(metros.map((m) => [m, facilitiesRanking(filterByMetros(data, [m]), latest)])),
    [metros, data, latest]
  );

  /* live DC exclusives, one netfac call per metro (fac_id__in) */
  const [facEx, setFacEx] = useState<Record<string, { loading: boolean; rows: FacExRow[] | null; error: string | null }>>({});
  useEffect(() => {
    let alive = true;
    metros.forEach((metro) => {
      if (facEx[metro]) return;
      const facs = facMetaByMetro.get(metro) || [];
      if (!facs.length) {
        setFacEx((s) => ({ ...s, [metro]: { loading: false, rows: [], error: null } }));
        return;
      }
      setFacEx((s) => ({ ...s, [metro]: { loading: true, rows: null, error: null } }));
      fetchPeeringDb<any>("netfac", { fac_id__in: facs.map((f) => f.facilityId).join(","), all: 1 })
        .then((resp) => {
          if (!alive) return;
          const perNet = new Map<number, Set<number>>();
          for (const r of resp.data || []) {
            if (!r.local_asn) continue;
            let s = perNet.get(r.local_asn);
            if (!s) {
              s = new Set();
              perNet.set(r.local_asn, s);
            }
            s.add(r.fac_id);
          }
          const memberCount = new Map<number, number>();
          const exclusives = new Map<number, ExclusiveNet[]>();
          perNet.forEach((set, asn) => {
            set.forEach((fid) => memberCount.set(fid, (memberCount.get(fid) || 0) + 1));
            if (set.size !== 1) return;
            const fid = Array.from(set)[0];
            const d = dirByAsn.get(asn);
            if (d && isRouteServerish(d.name)) return;
            let a = exclusives.get(fid);
            if (!a) {
              a = [];
              exclusives.set(fid, a);
            }
            a.push({ asn, name: d?.name || `AS${asn}`, capG: (d?.capT || 0) * 1000 });
          });
          const rows: FacExRow[] = facs
            .map((f) => ({
              facId: f.facilityId,
              name: f.name,
              org: f.org,
              isEquinix: f.isEquinix,
              members: memberCount.get(f.facilityId) || 0,
              exclusives: (exclusives.get(f.facilityId) || []).sort((a, b) => b.capG - a.capG),
            }))
            .sort((a, b) => b.exclusives.length - a.exclusives.length);
          setFacEx((s) => ({ ...s, [metro]: { loading: false, rows, error: null } }));
        })
        .catch((e) => alive && setFacEx((s) => ({ ...s, [metro]: { loading: false, rows: null, error: e?.message || "Fetch failed" } })));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metros.join("|"), facMetaByMetro, dirByAsn]);

  const [open, setOpen] = useState<string | null>(null);
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));

  const exList = (list: ExclusiveNet[], keyPrefix: string) => (
    <div className="rd-exlist">
      {list.slice(0, 12).map((n) => (
        <Link key={`${keyPrefix}-${n.asn}`} className="rd-mover rd-rowlink" to={{ pathname: `/net/${n.asn}`, search }}>
          <span className="nm">
            {n.name.length > 30 ? `${n.name.slice(0, 29)}…` : n.name}
            <span>AS{n.asn}</span>
          </span>
          <span className="mv rd-num" style={{ color: "var(--muted)" }}>
            {gLbl(n.capG)}
          </span>
        </Link>
      ))}
      {list.length > 12 ? (
        <div style={{ padding: "6px 11px", color: "var(--faint)", fontSize: 11.5 }}>+{list.length - 12} more exclusives</div>
      ) : null}
      {!list.length ? <div style={{ padding: "8px 11px", color: "var(--muted)", fontSize: 12 }}>No exclusive networks.</div> : null}
    </div>
  );

  return (
    <>
      {metros.map((metro) => {
        const rows = ixEx.get(metro) || [];
        const totalExcl = rows.reduce((a, r) => a + r.exclusives.length, 0);
        const eqxExcl = rows.filter((r) => r.isEquinix).reduce((a, r) => a + r.exclusives.length, 0);
        const maxIx = rows[0]?.exclusives.length || 1;
        const fac = facEx[metro];
        const facRows = (fac?.rows || []).slice(0, 8);
        const maxFac = facRows[0]?.exclusives.length || 1;
        return (
          <div className="rd-metroblock" key={metro}>
            <div className="rd-mb-head">
              <Link className="name" to={{ pathname: `/metro/${encodeURIComponent(metro)}`, search }}>
                {metro}
              </Link>
              <span className="rd-cc">{METRO_CODES[metro] || ""}</span>
              <span className="rd-mb-note" style={{ fontStyle: "normal" }}>
                {totalExcl} single-IX networks · <b style={{ color: "var(--equinix)" }}>{eqxExcl} on Equinix</b>
              </span>
            </div>
            <div className="rd-mb-body">
              {/* exchanges */}
              <div className="rd-mb-half">
                <div className="rd-mb-plabel">Exchanges — exclusive members · {fmtMonth(latest)}</div>
                {rows.slice(0, 8).map((r, i) => {
                  const key = `ix:${metro}:${r.ixId}`;
                  const pct = r.members ? (r.exclusives.length / r.members) * 100 : 0;
                  return (
                    <div key={key}>
                      <button type="button" className="rd-shrow rd-metrorow rd-exrow" onClick={() => toggle(key)} style={{ gridTemplateColumns: "22px 1fr 90px 120px" }}>
                        <span className="rk rd-num">{i + 1}</span>
                        <span className="nm" style={r.isEquinix ? { color: "var(--equinix)" } : undefined}>
                          {r.name.length > 26 ? `${r.name.slice(0, 25)}…` : r.name}
                          <span className="rd-cc" style={{ marginLeft: 6 }}>{open === key ? "▾" : "▸"}</span>
                        </span>
                        <Bar pct={(r.exclusives.length / maxIx) * 100} color={r.isEquinix ? "var(--equinix)" : "var(--accent)"} />
                        <span className="fr rd-num">
                          <b style={{ color: "var(--text)" }}>{r.exclusives.length}</b> · {pct.toFixed(0)}% of {r.members}
                        </span>
                      </button>
                      {open === key ? exList(r.exclusives, key) : null}
                    </div>
                  );
                })}
                {rows.length > 8 ? (
                  <div style={{ padding: "8px 2px", color: "var(--faint)", fontSize: 11.5 }}>+{rows.length - 8} smaller exchanges</div>
                ) : null}
              </div>
              {/* data centres */}
              <div className="rd-mb-half rd-mb-right">
                <div className="rd-mb-plabel">Data centres — exclusive tenants · live</div>
                {fac?.loading || !fac ? (
                  <div style={{ padding: "10px 2px", color: "var(--muted)", fontSize: 12.5 }}>Fetching facility membership from PeeringDB…</div>
                ) : fac.error ? (
                  <div style={{ padding: "10px 2px", color: "var(--gap)", fontSize: 12.5 }}>Couldn't load facilities: {fac.error}</div>
                ) : facRows.length ? (
                  <>
                    {facRows.map((f, i) => {
                      const key = `fac:${metro}:${f.facId}`;
                      const pct = f.members ? (f.exclusives.length / f.members) * 100 : 0;
                      return (
                        <div key={key}>
                          <button type="button" className="rd-shrow rd-metrorow rd-exrow" onClick={() => toggle(key)} style={{ gridTemplateColumns: "22px 1fr 90px 120px" }}>
                            <span className="rk rd-num">{i + 1}</span>
                            <span className="nm" style={f.isEquinix ? { color: "var(--equinix)" } : undefined} title={`${f.name} · ${f.org}`}>
                              {f.name.length > 26 ? `${f.name.slice(0, 25)}…` : f.name}
                              <span className="rd-cc" style={{ marginLeft: 6 }}>{open === key ? "▾" : "▸"}</span>
                            </span>
                            <Bar pct={(f.exclusives.length / maxFac) * 100} color={f.isEquinix ? "var(--equinix)" : "var(--accent)"} />
                            <span className="fr rd-num">
                              <b style={{ color: "var(--text)" }}>{f.exclusives.length}</b> · {pct.toFixed(0)}% of {f.members}
                            </span>
                          </button>
                          {open === key ? (
                            <>
                              {exList(f.exclusives, key)}
                              {open === key ? (
                                <div style={{ padding: "0 11px 8px", fontSize: 11.5 }}>
                                  <Link to={{ pathname: `/fac/${f.facId}`, search }} className="rd-netlink">
                                    Open data-centre profile →
                                  </Link>
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                    {(fac.rows || []).length > 8 ? (
                      <div style={{ padding: "8px 2px", color: "var(--faint)", fontSize: 11.5 }}>+{(fac.rows || []).length - 8} smaller facilities</div>
                    ) : null}
                  </>
                ) : (
                  <div style={{ padding: "10px 2px", color: "var(--muted)", fontSize: 12.5 }}>No listed facilities in {metro}.</div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="rd-footnote">
        “Exclusive” = present at only ONE exchange (or data centre) within that metro — the networks a customer cannot
        reach anywhere else in the market. Exchange exclusivity is snapshot-based ({fmtMonth(latest)}, follows the time
        slider); data-centre exclusivity is fetched live from PeeringDB, since snapshots only store facility totals.
        Route-server / infrastructure ASNs are excluded. Click a row to see who the exclusives are — sorted so the
        valuable ones (biggest port, or biggest network for DCs) come first. Scope: {scopeName}.
      </div>
    </>
  );
}

function isRouteServerish(n: string) {
  return /route server|route-server|rs[0-9]* ?only/i.test(n || "");
}
