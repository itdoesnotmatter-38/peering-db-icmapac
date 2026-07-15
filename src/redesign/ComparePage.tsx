import React, { useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { NetworkTypeahead, useTooltip } from "./bits";
import { METRO_CODES, networkProfile, networksDirectory } from "./data";

/* Compare — pick multiple networks (type names or ASNs), see each one's
   IX capacity allocation per scoped metro, side by side. Markets are never
   blended: one mini stacked bar per metro per network. Selection lives in
   the ?nets= URL param so a comparison is a shareable link. */

const SEG = ["#2BB0C4", "#4F86D6", "#3FB27F", "#E0A73C", "#D8617D", "#7C8AA0"];
const gLabel = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(1)}T` : g > 0 ? `${g.toFixed(0)}G` : "—");

export default function ComparePage() {
  const { data, scoped, derived, scopeName, asOf } = useSnapshot();
  const { search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { bind, node: tipNode } = useTooltip();

  const asns = useMemo(
    () =>
      (searchParams.get("nets") || "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    [searchParams]
  );
  const setAsns = (list: number[]) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (list.length) next.set("nets", list.join(","));
        else next.delete("nets");
        return next;
      },
      { replace: true }
    );

  const dir = useMemo(() => networksDirectory(data, derived.latest), [data, derived.latest]);
  const dirScoped = useMemo(() => networksDirectory(scoped, derived.latest), [scoped, derived.latest]);
  const metros = derived.metros.map((m) => m.metro);

  const rows = useMemo(
    () =>
      asns.map((a) => {
        const p = networkProfile(data, a, asOf);
        const cells = metros.map((metro) => {
          const ports = p.ports.filter((x) => x.metro === metro).sort((x, y) => y.capG - x.capG);
          const totalG = ports.reduce((s, x) => s + x.capG, 0);
          const top = ports.slice(0, 5);
          const rest = ports.slice(5);
          const segs = top.map((x, i) => ({
            label: x.ixName,
            capG: x.capG,
            color: x.isEquinix ? "var(--equinix)" : SEG[i % SEG.length],
          }));
          if (rest.length) segs.push({ label: `${rest.length} more`, capG: rest.reduce((s, x) => s + x.capG, 0), color: "#5b6b7d" });
          return { metro, totalG, segs };
        });
        const rowMax = Math.max(1, ...cells.map((c) => c.totalG));
        return { asn: a, p, cells, rowMax };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, asns.join(","), metros.join("|"), asOf]
  );

  const suggestions = dirScoped.slice(0, 5).filter((s) => !asns.includes(s.asn));

  return (
    <>
      <div className="rd-slider-bar" style={{ alignItems: "center" }}>
        <div style={{ minWidth: 300, flex: 1, maxWidth: 420 }}>
          <NetworkTypeahead options={dir} onPick={(a) => !asns.includes(a) && setAsns([...asns, a])} onPickMany={(list) => setAsns(Array.from(new Set([...asns, ...list])))} exclude={new Set(asns)} />
        </div>
        <div className="rd-chips" style={{ marginBottom: 0 }}>
          {asns.map((a) => {
            const nm = rows.find((r) => r.asn === a)?.p.name || `AS${a}`;
            return (
              <button key={a} className="rd-chip on" onClick={() => setAsns(asns.filter((x) => x !== a))} title="Remove">
                {nm.length > 20 ? `${nm.slice(0, 19)}…` : nm} ✕
              </button>
            );
          })}
        </div>
        <div className="rd-grow" />
        <span className="note rd-num">
          {asns.length} network{asns.length === 1 ? "" : "s"} · {metros.length} metros · {scopeName}
        </span>
      </div>

      {!asns.length ? (
        <div className="rd-center">
          <h3>Pick networks to compare</h3>
          <p style={{ marginBottom: 14 }}>Type names or ASNs above — or start from the biggest in scope:</p>
          <div className="rd-chips" style={{ justifyContent: "center" }}>
            {suggestions.map((s) => (
              <button key={s.asn} className="rd-chip" onClick={() => setAsns([...asns, s.asn])}>
                + {s.name.length > 22 ? `${s.name.slice(0, 21)}…` : s.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="rd-sec-head">
            <h2>Allocation by metro</h2>
            <span className="note">Bar width = capacity relative to each network's biggest metro · Equinix violet · hover for detail</span>
          </div>
          <div className="rd-heatwrap">
            <table className="rd-cgrid">
              <thead>
                <tr>
                  <th className="who">Network</th>
                  {metros.map((m) => (
                    <th key={m}>
                      <Link to={{ pathname: `/metro/${encodeURIComponent(m)}`, search }}>{METRO_CODES[m] || m}</Link>
                      <span className="mx">{m}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.asn}>
                    <td className="who">
                      <Link to={{ pathname: `/net/${r.asn}`, search }} className="nm rd-netlink">
                        {r.p.name.length > 22 ? `${r.p.name.slice(0, 21)}…` : r.p.name}
                      </Link>
                      <span className="sub rd-num">AS{r.asn}</span>
                    </td>
                    {r.cells.map((c) => (
                      <td key={c.metro} className="cell">
                        {c.totalG > 0 ? (
                          <div className="rd-cmini-wrap">
                            <div className="rd-cmini" style={{ width: `${Math.max(6, (c.totalG / r.rowMax) * 100)}%` }}>
                              {c.segs.map((s, i) => (
                                <i
                                  key={i}
                                  style={{ width: `${(s.capG / c.totalG) * 100}%`, background: s.color }}
                                  {...bind(
                                    <>
                                      <div className="th">{r.p.name}</div>
                                      <div className="tl">
                                        <span>{s.label}</span>
                                        <b>{gLabel(s.capG)}</b>
                                      </div>
                                      <div className="tl">
                                        <span>{c.metro} total</span>
                                        <b>{gLabel(c.totalG)}</b>
                                      </div>
                                    </>
                                  )}
                                />
                              ))}
                            </div>
                            <span className="tot rd-num">{gLabel(c.totalG)}</span>
                          </div>
                        ) : (
                          <span className="none">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rd-footnote">
            Each cell is that network's IX port allocation in one metro — segments are exchanges (Equinix violet), bar
            length compares the network's own metros. "—" means no listed exchange ports there. Metro scope and network
            selection both live in the URL, so this exact comparison is a shareable link.
          </div>
        </>
      )}
      {tipNode}
    </>
  );
}
