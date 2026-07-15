import React, { useCallback, useState } from "react";

/* One shared, mouse-following tooltip for heatmap cells. Render `node`
   once at the page root; spread `bind(content)` onto each hoverable cell. */
export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const bind = useCallback(
    (content: React.ReactNode) => ({
      onMouseEnter: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
      onMouseMove: (e: React.MouseEvent) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t)),
      onMouseLeave: () => setTip(null),
    }),
    []
  );
  const flip = tip ? tip.x > window.innerWidth - 260 : false;
  const node = tip ? (
    <div
      className="rd-tip"
      style={{
        left: flip ? undefined : tip.x + 14,
        right: flip ? window.innerWidth - tip.x + 14 : undefined,
        top: tip.y + 16,
      }}
    >
      {tip.content}
    </div>
  ) : null;
  return { bind, node };
}

/* Small shared pieces for the redesigned views. */

export function Sparkline({ points, width = 104, height = 30 }: { points: number[]; width?: number; height?: number }) {
  const gid = React.useId();
  if (!points.length) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const rng = max - min || 1;
  const step = width / Math.max(points.length - 1, 1);
  const xy = points.map((p, i) => [i * step, height - 4 - ((p - min) / rng) * (height - 8)]);
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const last = xy[xy.length - 1];
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="2.6" fill="var(--accent)" />
    </svg>
  );
}

export function Delta({ value, unit = "", vs }: { value: number; unit?: string; vs?: string }) {
  const cls = value > 0 ? "rd-up" : value < 0 ? "rd-down" : "rd-flat";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "—";
  const text =
    value === 0 ? "no change" : `${value > 0 ? "+" : "−"}${Math.abs(value) % 1 === 0 ? Math.abs(value) : Math.abs(value).toFixed(1)}${unit}`;
  return (
    <span className="delta rd-num">
      <span className={cls}>
        {arrow} {text}
      </span>
      {vs ? <span className="rd-flat"> vs {vs}</span> : null}
    </span>
  );
}

export function Kpi({
  label,
  value,
  unit,
  delta,
  deltaUnit,
  vs,
  spark,
  deltaNode,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: number;
  deltaUnit?: string;
  vs?: string;
  spark?: number[];
  deltaNode?: React.ReactNode;
}) {
  return (
    <div className="rd-kpi">
      <span className="rd-eyebrow">{label}</span>
      <div className="val rd-num">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      <div className="delta">{deltaNode ?? (delta !== undefined ? <Delta value={delta} unit={deltaUnit} vs={vs} /> : null)}</div>
      {spark ? <Sparkline points={spark} /> : null}
    </div>
  );
}

export function Bar({ pct, color }: { pct: number; color?: string }) {
  return (
    <span className="rd-bar">
      <i style={{ width: `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`, background: color }} />
    </span>
  );
}

export function Panel({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <div className="rd-panel">
      <div className="rd-panel-h">
        <span className="t">{title}</span>
        {tag ? <span className="rd-eyebrow">{tag}</span> : null}
      </div>
      <div className="rd-panel-b">{children}</div>
    </div>
  );
}

/* Type-ahead for picking networks by name or ASN. Pass the directory
   options; Enter with a raw number falls through as an ASN. */
export function NetworkTypeahead({
  options,
  onPick,
  placeholder,
  exclude,
}: {
  options: Array<{ asn: number; name: string; type: string; capT: number }>;
  onPick: (asn: number) => void;
  placeholder?: string;
  exclude?: Set<number>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const asnq = s.replace(/^as/, "");
    return options
      .filter((o) => !exclude?.has(o.asn))
      .filter((o) => o.name.toLowerCase().includes(s) || String(o.asn).includes(asnq))
      .slice(0, 8);
  }, [q, options, exclude]);

  const pick = (asn: number) => {
    onPick(asn);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="rd-ta">
      <div className="rd-search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3-3" />
        </svg>
        <input
          value={q}
          placeholder={placeholder || "Add network by name or ASN…"}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (matches.length) pick(matches[0].asn);
              else {
                const n = Number(q.replace(/^as/i, "").trim());
                if (Number.isFinite(n) && n > 0) pick(n);
              }
            }
            if (e.key === "Escape") setOpen(false);
          }}
        />
      </div>
      {open && matches.length ? (
        <div className="rd-ta-pop">
          {matches.map((m) => (
            <div key={m.asn} className="rd-ta-row" onMouseDown={() => pick(m.asn)}>
              <span className="nm">{m.name}</span>
              <span className="as rd-num">AS{m.asn}</span>
              <span className="cap rd-num">{m.capT.toFixed(1)}T</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* Dual-handle range slider over N detents (snapshot timeline). */
export function DualRange({
  count,
  from,
  to,
  onChange,
}: {
  count: number;
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
}) {
  const pct = (i: number) => (count > 1 ? (i / (count - 1)) * 100 : 0);
  return (
    <div className="rd-dualwrap">
      <div className="rd-dualtrack" />
      <div className="rd-dualfill" style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }} />
      <input
        type="range"
        min={0}
        max={count - 1}
        step={1}
        value={from}
        aria-label="From snapshot"
        onChange={(e) => onChange(Math.min(Number(e.target.value), to - 1), to)}
      />
      <input
        type="range"
        min={0}
        max={count - 1}
        step={1}
        value={to}
        aria-label="To snapshot"
        onChange={(e) => onChange(from, Math.max(Number(e.target.value), from + 1))}
      />
    </div>
  );
}

export function Loading({ note }: { note?: string }) {
  return (
    <div className="rd-center">
      <div className="rd-spinner" />
      <h3>Loading snapshot data</h3>
      <p>{note || "One fetch per session — the monthly snapshot loads once and every view shares it."}</p>
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rd-center">
      <h3>Couldn't load snapshot data</h3>
      <p style={{ marginBottom: 16 }}>{message}</p>
      <button className="rd-btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
