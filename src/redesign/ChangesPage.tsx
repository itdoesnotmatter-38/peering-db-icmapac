import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSnapshot } from "./Shell";
import { Kpi } from "./bits";
import { ShiftStatus, fmtDayMonth, marketChanges, shiftColumns } from "./data";

/* Market-changes deep dive: a network × exchange matrix of port-capacity
   change between two snapshots. Cell = how much a network grew/shrank its
   port at that IX. Surfaces upgrades, reductions, and migrations (capacity
   moved between exchanges) that a flat list can't show. */

type Filter = "all" | "up" | "down" | "added" | "removed" | "migration";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All changes" },
  { id: "up", label: "Upgrades" },
  { id: "down", label: "Reductions" },
  { id: "added", label: "New on IX" },
  { id: "removed", label: "Left IX" },
  { id: "migration", label: "Migrations" },
];

const gLabel = (g: number) => {
  const a = Math.abs(g);
  const s = g > 0 ? "+" : "−";
  if (a >= 1000) return `${s}${(a / 1000).toFixed(1)}T`;
  return `${s}${a.toFixed(0)}G`;
};

export default function ChangesPage() {
  const { scoped, derived } = useSnapshot();
  const { snapshots } = derived;
  const { search } = useLocation();

  const [from, setFrom] = useState(snapshots[snapshots.length - 2] || snapshots[0]);
  const [to, setTo] = useState(snapshots[snapshots.length - 1]);
  const [filter, setFilter] = useState<Filter>("all");

  const mc = useMemo(() => marketChanges(scoped, from, to), [scoped, from, to]);

  const filtered = useMemo(() => {
    const rows = mc.networks.filter((n) => (filter === "all" ? true : n.status === filter));
    return rows.slice(0, 16);
  }, [mc, filter]);

  const columns = useMemo(() => shiftColumns(filtered, 10), [filtered]);
  const maxAbs = useMemo(
    () => Math.max(1, ...filtered.flatMap((n) => n.cells.map((c) => Math.abs(c.changeG)))),
    [filtered]
  );

  const cellColor = (g: number) => {
    if (Math.abs(g) < 1) return "var(--surface-2)";
    const pct = Math.min(1, Math.abs(g) / maxAbs);
    const hue = g > 0 ? "var(--present)" : "var(--gap)";
    return `color-mix(in srgb, ${hue} ${Math.round(12 + pct * 58)}%, var(--surface))`;
  };

  const statusChip = (s: ShiftStatus) => {
    const map: Record<ShiftStatus, { c: string; bg: string; t: string }> = {
      up: { c: "var(--present)", bg: "var(--present-bg)", t: "upgrade" },
      down: { c: "var(--gap)", bg: "var(--gap-bg)", t: "reduction" },
      added: { c: "var(--present)", bg: "var(--present-bg)", t: "new" },
      removed: { c: "var(--gap)", bg: "var(--gap-bg)", t: "left" },
      migration: { c: "var(--watch)", bg: "var(--watch-bg)", t: "migration" },
    };
    const m = map[s];
    return (
      <span className="rd-stag" style={{ color: m.c, background: m.bg }}>
        {m.t}
      </span>
    );
  };

  const cellFor = (net: (typeof filtered)[number], ixId: number) => net.cells.find((c) => c.ixId === ixId);

  return (
    <>
      {/* period + filter bar */}
      <div className="rd-slider-bar" style={{ alignItems: "center" }}>
        <div className="rd-period">
          <span className="rd-eyebrow">Compare</span>
          <select className="rd-select" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From snapshot">
            {snapshots.map((s) => (
              <option key={s} value={s}>
                {fmtDayMonth(s)} {s.slice(0, 4)}
              </option>
            ))}
          </select>
          <span style={{ color: "var(--faint)" }}>→</span>
          <select className="rd-select" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To snapshot">
            {snapshots.map((s) => (
              <option key={s} value={s}>
                {fmtDayMonth(s)} {s.slice(0, 4)}
              </option>
            ))}
          </select>
        </div>
        <div className="rd-grow" />
        <div className="rd-chips" style={{ marginBottom: 0 }}>
          {FILTERS.map((f) => (
            <button key={f.id} className={`rd-chip${filter === f.id ? " on" : ""}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rd-kpis four">
        <Kpi label="Upgraded capacity" value={(mc.summary.upgradedG / 1000).toFixed(1)} unit="Tbps" deltaNode={<span className="rd-up">▲ ports grown</span>} />
        <Kpi label="Reduced capacity" value={(mc.summary.reducedG / 1000).toFixed(1)} unit="Tbps" deltaNode={<span className="rd-down">▼ ports cut</span>} />
        <Kpi label="Net capacity shift" value={(mc.summary.netG / 1000).toFixed(1)} unit="Tbps" deltaNode={<span className={mc.summary.netG >= 0 ? "rd-up" : "rd-down"}>{mc.summary.netG >= 0 ? "▲" : "▼"} across scope</span>} />
        <Kpi
          label="Migrations · new · left"
          value={`${mc.summary.migrations} · ${mc.summary.added} · ${mc.summary.removed}`}
          deltaNode={<span className="rd-flat">networks</span>}
        />
      </div>

      <div className="rd-sec-head">
        <h2>Who moved capacity, and where</h2>
        <span className="note">
          {fmtDayMonth(from)} → {fmtDayMonth(to)} · rows = networks, columns = exchanges (Equinix pinned) · green grew, red cut
        </span>
      </div>

      <div className="rd-heatwrap">
        <table className="rd-shift">
          <thead>
            <tr>
              <th className="who">Network</th>
              {columns.map((c) => (
                <th key={c.ixId} className={c.isEquinix ? "eqx" : ""}>
                  <Link to={{ pathname: `/exchange/${c.ixId}`, search }} title={`${c.ixName} · ${c.metro}`}>
                    {c.ixName.length > 16 ? `${c.ixName.slice(0, 15)}…` : c.ixName}
                  </Link>
                  <span className="mx">{c.metro}</span>
                </th>
              ))}
              <th className="tot">Net</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((n) => (
              <tr key={n.key}>
                <td className="who">
                  <span className="nm">{n.name.length > 24 ? `${n.name.slice(0, 23)}…` : n.name}</span>
                  <span className="sub rd-num">AS{n.asn}</span>
                  {statusChip(n.status)}
                </td>
                {columns.map((c) => {
                  const cell = cellFor(n, c.ixId);
                  return (
                    <td
                      key={c.ixId}
                      className={`cell rd-num${c.isEquinix ? " eqxcol" : ""}`}
                      style={{ background: cell ? cellColor(cell.changeG) : undefined }}
                    >
                      {cell ? gLabel(cell.changeG) : "·"}
                    </td>
                  );
                })}
                <td className={`tot rd-num ${n.totalChangeG > 0 ? "rd-up" : n.totalChangeG < 0 ? "rd-down" : "rd-flat"}`}>
                  {n.status === "migration" ? "~0" : gLabel(n.totalChangeG)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!filtered.length ? (
        <div style={{ padding: "18px 4px", color: "var(--muted)", fontSize: 13 }}>
          No {filter === "all" ? "capacity changes" : `${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()}`} in
          this period for the selected metros. Try a wider date range or more metros.
        </div>
      ) : null}

      <div className="rd-footnote">
        Each cell is the change in a network's reported port capacity at one exchange between the two snapshots.
        <b> Migrations</b> (amber) are networks whose total is roughly flat but who moved capacity between exchanges —
        often a network shifting ports onto, or off, a given IX. Click any exchange header for its full profile.
        PeeringDB is self-reported, so read a change as a change in the listed record, not certain live traffic.
      </div>
    </>
  );
}
