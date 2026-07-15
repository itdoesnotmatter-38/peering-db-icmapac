import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchPeeringDb } from "../peeringdbApi";
import { useSnapshot } from "./Shell";
import { useTooltip } from "./bits";
import { metroExchanges, snapshotNetNames } from "./data";

/* Live explore — today's PeeringDB truth for one metro, on demand.
   Reuses the snapshot's known exchanges for the metro and fetches a single
   live netixlan call, so it loads in seconds rather than minutes. The
   ASN × exchange capacity matrix, Equinix pinned, click-through to the
   same exchange / network profiles. */

interface LiveMatrix {
  fetchedAt: string;
  columns: Array<{ ixId: number; ixName: string; isEquinix: boolean; totalG: number }>;
  rows: Array<{ netId: number; asn: number; name: string; totalG: number; cells: Map<number, number> }>;
  netCount: number;
}

const gLabel = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(1)}T` : `${g.toFixed(0)}G`);

export default function LivePage() {
  const { data, derived } = useSnapshot();
  const { metros } = derived;
  const { search } = useLocation();
  const { bind, node: tipNode } = useTooltip();

  const [metro, setMetro] = useState(metros[0]?.metro || "Singapore");
  const [state, setState] = useState<{ loading: boolean; error: string | null; matrix: LiveMatrix | null }>({
    loading: false,
    error: null,
    matrix: null,
  });

  useEffect(() => {
    if (!metros.some((m) => m.metro === metro) && metros.length) setMetro(metros[0].metro);
  }, [metros, metro]);

  const exchanges = useMemo(() => metroExchanges(data, metro), [data, metro]);
  const netNames = useMemo(() => snapshotNetNames(data), [data]);

  const load = useCallback(async () => {
    if (!exchanges.length) return;
    setState({ loading: true, error: null, matrix: null });
    try {
      const ixIds = exchanges.map((e) => e.ixId).join(",");
      const resp = await fetchPeeringDb<any>("netixlan", { ix_id__in: ixIds, all: 1 });

      // aggregate live speed (Mbps) per (net, ix)
      const cellMap = new Map<string, number>();
      const rowAgg = new Map<number, { netId: number; asn: number; totalG: number; cells: Map<number, number> }>();
      const colTotal = new Map<number, number>();
      for (const r of resp.data) {
        if (r.operational === false) continue;
        const g = (r.speed || 0) / 1000;
        if (g <= 0) continue;
        const key = `${r.net_id}|${r.ix_id}`;
        cellMap.set(key, (cellMap.get(key) || 0) + g);
        const row = rowAgg.get(r.net_id) || { netId: r.net_id, asn: r.asn, totalG: 0, cells: new Map<number, number>() };
        row.totalG += g;
        row.cells.set(r.ix_id, (row.cells.get(r.ix_id) || 0) + g);
        row.asn = r.asn;
        rowAgg.set(r.net_id, row);
        colTotal.set(r.ix_id, (colTotal.get(r.ix_id) || 0) + g);
      }

      const columns = exchanges
        .map((e) => ({ ...e, totalG: colTotal.get(e.ixId) || 0 }))
        .sort((a, b) => {
          if (a.isEquinix !== b.isEquinix) return a.isEquinix ? -1 : 1;
          return b.totalG - a.totalG;
        })
        .slice(0, 12);

      const rows = Array.from(rowAgg.values())
        .map((r) => ({
          ...r,
          name: netNames.get(r.netId)?.name || `AS${r.asn}`,
        }))
        .sort((a, b) => b.totalG - a.totalG)
        .slice(0, 22);

      const now = new Date();
      const fetchedAt = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      setState({ loading: false, error: null, matrix: { fetchedAt, columns, rows, netCount: rowAgg.size } });
    } catch (e: any) {
      setState({ loading: false, error: e?.message || "Live fetch failed", matrix: null });
    }
  }, [exchanges, netNames]);

  const m = state.matrix;
  const maxCell = useMemo(() => (m ? Math.max(1, ...m.rows.flatMap((r) => Array.from(r.cells.values()))) : 1), [m]);
  const cellColor = (g: number) => {
    if (!g) return "var(--surface-2)";
    const pct = Math.min(1, g / maxCell);
    return `color-mix(in srgb, var(--accent) ${Math.round(14 + pct * 55)}%, var(--surface))`;
  };

  return (
    <>
      <div className="rd-slider-bar" style={{ alignItems: "center" }}>
        <div className="rd-period">
          <span className="rd-eyebrow">Metro</span>
          <div className="rd-chips" style={{ marginBottom: 0 }}>
            {metros.map((mm) => (
              <button key={mm.metro} className={`rd-chip${mm.metro === metro ? " on" : ""}`} onClick={() => setMetro(mm.metro)}>
                {mm.metro}
              </button>
            ))}
          </div>
        </div>
        <div className="rd-grow" />
        {m ? (
          <span className="rd-pill snap" style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)" }}>
            <span className="dot" style={{ background: "var(--accent)", boxShadow: "0 0 0 3px color-mix(in srgb,var(--accent) 20%,transparent)" }} />
            <span className="cap">Live</span> fetched {m.fetchedAt}
          </span>
        ) : null}
        <button className="rd-btn" onClick={load} disabled={state.loading}>
          {state.loading ? "Fetching…" : m ? "Refresh live" : "Fetch live data"}
        </button>
      </div>

      <div className="rd-sec-head">
        <h2>{metro} — live exchange presence</h2>
        <span className="note">
          Today's PeeringDB ports · {exchanges.length} exchanges in this metro · Equinix pinned
        </span>
      </div>

      {state.error ? (
        <div className="rd-center">
          <h3>Live fetch failed</h3>
          <p style={{ marginBottom: 16 }}>{state.error}</p>
          <button className="rd-btn" onClick={load}>
            Try again
          </button>
        </div>
      ) : state.loading ? (
        <div className="rd-center">
          <div className="rd-spinner" />
          <h3>Fetching {metro} live…</h3>
          <p>One PeeringDB call for this metro's exchanges — a few seconds, not the old full-region load.</p>
        </div>
      ) : !m ? (
        <div className="rd-center">
          <h3>Live data loads on demand</h3>
          <p style={{ marginBottom: 16 }}>
            The dashboard runs on monthly snapshots. Pull {metro}'s current ports straight from PeeringDB when you need
            today's truth.
          </p>
          <button className="rd-btn" onClick={load}>
            Fetch live data
          </button>
        </div>
      ) : (
        <>
          <div className="rd-heatwrap">
            <table className="rd-shift">
              <thead>
                <tr>
                  <th className="who">Network · {m.netCount} live</th>
                  {m.columns.map((c) => (
                    <th key={c.ixId} className={c.isEquinix ? "eqx" : ""}>
                      <Link to={{ pathname: `/exchange/${c.ixId}`, search }} title={c.ixName}>
                        {c.ixName.length > 15 ? `${c.ixName.slice(0, 14)}…` : c.ixName}
                      </Link>
                      <span className="mx">{gLabel(c.totalG)}</span>
                    </th>
                  ))}
                  <th className="tot">Total</th>
                </tr>
              </thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.netId}>
                    <td className="who">
                      <Link to={{ pathname: `/net/${r.asn}`, search }} className="nm rd-netlink">
                        {r.name.length > 24 ? `${r.name.slice(0, 23)}…` : r.name}
                      </Link>
                      <span className="sub rd-num">AS{r.asn}</span>
                    </td>
                    {m.columns.map((c) => {
                      const g = r.cells.get(c.ixId) || 0;
                      return (
                        <td
                          key={c.ixId}
                          className={`cell rd-num${c.isEquinix ? " eqxcol" : ""}`}
                          style={{ background: g ? cellColor(g) : undefined }}
                          {...(g
                            ? bind(
                                <>
                                  <div className="th">{r.name}</div>
                                  <div className="tl">
                                    <span>{c.ixName}</span>
                                    <b>{gLabel(g)}</b>
                                  </div>
                                </>
                              )
                            : {})}
                        >
                          {g ? gLabel(g) : "·"}
                        </td>
                      );
                    })}
                    <td className="tot rd-num">{gLabel(r.totalG)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rd-footnote">
            Live from PeeringDB just now — showing the top {m.rows.length} networks by deployed capacity across{" "}
            {metro}'s exchanges. Network names come from the latest snapshot; ports and capacities are live. Use the
            snapshot views for history and market analysis; use this for today's exact ports.
          </div>
        </>
      )}
      {tipNode}
    </>
  );
}
