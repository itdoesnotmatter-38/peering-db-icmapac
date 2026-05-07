import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { withApiRoot } from "./apiBase";

type MetricKey = "capacityMbps" | "networkCount" | "facilityPresenceCount" | "ixCount" | "facilityCount";
type TrendView = "overview" | "network" | "diff" | "ix" | "facility";
type DiffFilter = "all" | "upgrades" | "reductions" | "added" | "removed" | "dc_changes";

interface MetroOption {
  key: string;
  city: string;
  country: string;
}

interface MetroTrendRow {
  snapshotDate: string;
  metro: string;
  country: string;
  city: string;
  capacityMbps: number;
  networkCount: number;
  ixCount: number;
  facilityCount: number;
  facilityPresenceCount: number;
}

interface NetworkTrendRow {
  snapshotDate: string;
  metro: string;
  networkId: number;
  asn: number | null;
  networkName: string;
  networkType: string;
  capacityMbps: number;
  ixCount: number;
  facilityCount: number;
  presenceType: string;
}

interface NetworkIxTrendRow {
  snapshotDate: string;
  metro: string;
  networkId: number;
  asn: number | null;
  networkName: string;
  ixId: number;
  ixName: string;
  capacityMbps: number;
}

interface IxTrendRow {
  snapshotDate: string;
  metro: string;
  ixId: number;
  ixName: string;
  capacityMbps: number;
  networkCount: number;
}

interface FacilityTrendRow {
  snapshotDate: string;
  metro: string;
  facilityId: number;
  facilityName: string;
  facilityOrgName: string;
  networkCount: number;
}

interface TrendPayload {
  region: string;
  metros: MetroOption[];
  snapshots: string[];
  skippedSnapshots?: Array<{ snapshotDate: string; reason: string }>;
  metroTrend: MetroTrendRow[];
  networkTrend: NetworkTrendRow[];
  networkIxTrend: NetworkIxTrendRow[];
  ixTrend: IxTrendRow[];
  facilityTrend: FacilityTrendRow[];
}

interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: Record<string, number>;
}

const shell = {
  bg: "#020617",
  panel: "#07111f",
  panel2: "#0b1220",
  border: "#334155",
  grid: "#1f2a3d",
  text: "#e5e7eb",
  muted: "#9ca3af",
  soft: "#cbd5e1",
  accent: "#38bdf8",
  green: "#22c55e",
  amber: "#f59e0b",
};

const SERIES_COLORS = [
  "#38bdf8",
  "#22c55e",
  "#a855f7",
  "#f59e0b",
  "#f97316",
  "#14b8a6",
  "#e879f9",
  "#60a5fa",
  "#84cc16",
  "#f43f5e",
  "#fde047",
  "#2dd4bf",
  "#c084fc",
  "#fb7185",
];

const metricOptions: Array<{ key: MetricKey; label: string; format: "capacity" | "count" }> = [
  { key: "capacityMbps", label: "Deployed capacity", format: "capacity" },
  { key: "networkCount", label: "Unique networks", format: "count" },
  { key: "facilityPresenceCount", label: "Network/DC presences", format: "count" },
  { key: "ixCount", label: "IX count", format: "count" },
  { key: "facilityCount", label: "Facility count", format: "count" },
];

const formatCount = (value: number) => new Intl.NumberFormat("en-US").format(Math.round(value || 0));

const formatCapacity = (mbps: number) => {
  if (!Number.isFinite(mbps) || mbps <= 0) return "0 Gbps";
  if (mbps >= 1000000) return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(mbps / 1000000)} Tbps`;
  if (mbps >= 1000) return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(mbps / 1000)} Gbps`;
  return `${formatCount(mbps)} Mbps`;
};

const formatCapacityDelta = (mbps: number) => {
  const sign = mbps > 0 ? "+" : mbps < 0 ? "-" : "";
  return `${sign}${formatCapacity(Math.abs(mbps))}`;
};

const formatMetric = (value: number, format: "capacity" | "count") =>
  format === "capacity" ? formatCapacity(value) : formatCount(value);

const safeValue = (value: number) => (Number.isFinite(value) ? value : 0);

const buildCsv = (rows: Array<Array<string | number | null>>) =>
  rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell === null || cell === undefined ? "" : String(cell);
          const escaped = text.replace(/"/g, '""');
          return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
        })
        .join(",")
    )
    .join("\n");

const downloadCsv = (filename: string, rows: Array<Array<string | number | null>>) => {
  const blob = new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

function LineChart({
  snapshots,
  series,
  formatter,
}: {
  snapshots: string[];
  series: ChartSeries[];
  formatter: (value: number) => string;
}) {
  const width = 920;
  const height = 320;
  const padding = { top: 24, right: 28, bottom: 54, left: 76 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...series.flatMap((item) => snapshots.map((date) => safeValue(item.values[date]))));
  const xFor = (index: number) => padding.left + (snapshots.length <= 1 ? plotWidth / 2 : (plotWidth * index) / (snapshots.length - 1));
  const yFor = (value: number) => padding.top + plotHeight - (plotHeight * safeValue(value)) / maxValue;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", minWidth: 760, display: "block" }}>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = padding.top + plotHeight - plotHeight * tick;
          const value = maxValue * tick;
          return (
            <g key={`grid-${tick}`}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={shell.grid} />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" fill={shell.muted} fontSize="12">
                {formatter(value)}
              </text>
            </g>
          );
        })}
        {snapshots.map((date, index) => (
          <text key={date} x={xFor(index)} y={height - 18} textAnchor="middle" fill={shell.muted} fontSize="12">
            {date.slice(5)}
          </text>
        ))}
        {series.map((item) => {
          const points = snapshots.map((date, index) => `${xFor(index)},${yFor(item.values[date] || 0)}`).join(" ");
          return (
            <g key={item.key}>
              <polyline points={points} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {snapshots.map((date, index) => (
                <circle key={`${item.key}-${date}`} cx={xFor(index)} cy={yFor(item.values[date] || 0)} r="4" fill={item.color}>
                  <title>
                    {item.label} · {date}: {formatter(item.values[date] || 0)}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function StackedBar({
  segments,
  total,
}: {
  segments: Array<{ key: string; label: string; value: number; color: string }>;
  total: number;
}) {
  const safeTotal = Math.max(1, total);
  return (
    <div style={{ display: "flex", height: 24, borderRadius: 999, overflow: "hidden", border: `1px solid ${shell.border}` }}>
      {segments.map((segment) => {
        const pct = (segment.value / safeTotal) * 100;
        return (
          <div
            key={segment.key}
            style={{ width: `${pct}%`, minWidth: pct > 0 ? 3 : 0, background: segment.color }}
            title={`${segment.label}: ${formatCapacity(segment.value)} (${pct.toFixed(1)}%)`}
          />
        );
      })}
    </div>
  );
}

function HorizontalMetricBars({
  rows,
  valueFormatter,
  accent = "#38bdf8",
}: {
  rows: Array<{ key: string; label: string; sublabel?: string; value: number }>;
  valueFormatter: (value: number) => string;
  accent?: string;
}) {
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.length === 0 ? (
        <div style={{ color: shell.muted }}>No rows for this selection.</div>
      ) : (
        rows.map((row) => {
          const pct = Math.max(2, (row.value / maxValue) * 100);
          return (
            <div key={row.key}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 5 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: shell.text, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row.label}
                  </div>
                  {row.sublabel && <div style={{ color: shell.muted, fontSize: 12 }}>{row.sublabel}</div>}
                </div>
                <div style={{ color: shell.soft, fontWeight: 900, whiteSpace: "nowrap" }}>{valueFormatter(row.value)}</div>
              </div>
              <div style={{ height: 18, borderRadius: 999, border: `1px solid ${shell.border}`, background: "#020617", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: `linear-gradient(90deg, ${accent}, #22c55e)`,
                  }}
                  title={`${row.label}: ${valueFormatter(row.value)}`}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function TrendsPage() {
  const [payload, setPayload] = useState<TrendPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<TrendView>("overview");
  const [metric, setMetric] = useState<MetricKey>("capacityMbps");
  const [selectedMetros, setSelectedMetros] = useState<string[]>([]);
  const [networkQuery, setNetworkQuery] = useState("");
  const [selectedNetworkId, setSelectedNetworkId] = useState<number | null>(null);
  const [networkMetro, setNetworkMetro] = useState("");
  const [networkStartSnapshot, setNetworkStartSnapshot] = useState("");
  const [networkEndSnapshot, setNetworkEndSnapshot] = useState("");
  const [fromSnapshot, setFromSnapshot] = useState("");
  const [toSnapshot, setToSnapshot] = useState("");
  const [diffMetros, setDiffMetros] = useState<string[]>([]);
  const [diffFilter, setDiffFilter] = useState<DiffFilter>("all");

  useEffect(() => {
    const loadTrends = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(withApiRoot("/api/snapshots/trends?region=APAC&limit=24"));
        const json = await resp.json().catch(() => null);
        if (!resp.ok) {
          throw new Error(json?.error || `Trend API failed: ${resp.status}`);
        }
        setPayload(json);
        const metros = Array.isArray(json?.metros) ? json.metros.map((metro: MetroOption) => metro.key) : [];
        const snapshots = Array.isArray(json?.snapshots) ? json.snapshots : [];
        setSelectedMetros([]);
        setFromSnapshot(snapshots[0] || "");
        setToSnapshot(snapshots[snapshots.length - 1] || "");
        setNetworkStartSnapshot(snapshots[0] || "");
        setNetworkEndSnapshot(snapshots[snapshots.length - 1] || "");
        setNetworkMetro(metros[0] || "");
        setDiffMetros(metros[0] ? [metros[0]] : []);
        if (snapshots.length === 0) {
          setError("No complete trend snapshots found yet. We need at least one snapshot with stored net, ix, fac, netixlan, and netfac files.");
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load APAC trends.");
      } finally {
        setLoading(false);
      }
    };

    loadTrends();
  }, []);

  const snapshots = useMemo(() => payload?.snapshots || [], [payload]);
  const metros = useMemo(() => payload?.metros || [], [payload]);
  const activeMetric = metricOptions.find((option) => option.key === metric) || metricOptions[0];
  const visibleMetros = selectedMetros;
  const effectiveTrendMetros = selectedMetros.length > 0 ? selectedMetros : metros.map((metro) => metro.key);

  const overviewSeries = useMemo<ChartSeries[]>(() => {
    if (!payload) return [];
    return effectiveTrendMetros.map((metro, index) => {
      const rows = payload.metroTrend.filter((row) => row.metro === metro);
      const values = Object.fromEntries(rows.map((row) => [row.snapshotDate, safeValue(row[metric])]));
      return {
        key: metro,
        label: metro,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
        values,
      };
    });
  }, [effectiveTrendMetros, metric, payload]);

  const latestSnapshot = snapshots[snapshots.length - 1] || "";
  const selectedSnapshotRange = useMemo(() => {
    if (!networkStartSnapshot || !networkEndSnapshot) return snapshots;
    const startIndex = snapshots.indexOf(networkStartSnapshot);
    const endIndex = snapshots.indexOf(networkEndSnapshot);
    if (startIndex < 0 || endIndex < 0) return snapshots;
    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    return snapshots.slice(from, to + 1);
  }, [networkEndSnapshot, networkStartSnapshot, snapshots]);
  const latestMetroRows = useMemo(() => {
    if (!payload || !latestSnapshot) return [];
    return payload.metroTrend
      .filter((row) => row.snapshotDate === latestSnapshot && effectiveTrendMetros.includes(row.metro))
      .sort((a, b) => b[metric] - a[metric]);
  }, [effectiveTrendMetros, latestSnapshot, metric, payload]);

  const overviewAggregateSeries = useMemo<ChartSeries[]>(() => {
    if (!payload) return [];
    const values: Record<string, number> = {};
    snapshots.forEach((date) => {
      values[date] = payload.metroTrend
        .filter((row) => row.snapshotDate === date && effectiveTrendMetros.includes(row.metro))
        .reduce((sum, row) => sum + safeValue(row[metric]), 0);
    });
    return [
      {
        key: "apac-aggregate",
        label: selectedMetros.length > 0 ? "Selected metros" : "All APAC metros",
        color: "#38bdf8",
        values,
      },
    ];
  }, [effectiveTrendMetros, metric, payload, selectedMetros.length, snapshots]);

  const overviewTopMetros = useMemo(() => latestMetroRows.slice(0, 12), [latestMetroRows]);

  const overviewTotals = useMemo(() => {
    if (!payload || !latestSnapshot) {
      return {
        capacityMbps: 0,
        uniqueNetworks: 0,
        ixCount: 0,
        facilityCount: 0,
        facilityPresenceCount: 0,
      };
    }
    const metroRows = payload.metroTrend.filter(
      (row) => row.snapshotDate === latestSnapshot && effectiveTrendMetros.includes(row.metro)
    );
    const uniqueNetworks = new Set(
      payload.networkTrend
        .filter((row) => row.snapshotDate === latestSnapshot && effectiveTrendMetros.includes(row.metro))
        .map((row) => row.networkId)
    );
    return {
      capacityMbps: metroRows.reduce((sum, row) => sum + row.capacityMbps, 0),
      uniqueNetworks: uniqueNetworks.size,
      ixCount: metroRows.reduce((sum, row) => sum + row.ixCount, 0),
      facilityCount: metroRows.reduce((sum, row) => sum + row.facilityCount, 0),
      facilityPresenceCount: metroRows.reduce((sum, row) => sum + row.facilityPresenceCount, 0),
    };
  }, [effectiveTrendMetros, latestSnapshot, payload]);
  const showMetroComparisonAsPrimary = selectedMetros.length > 0 && selectedMetros.length <= 8;
  const primaryOverviewSeries = showMetroComparisonAsPrimary ? overviewSeries : overviewAggregateSeries;

  const networkOptions = useMemo(() => {
    if (!payload) return [];
    const query = networkQuery.trim().toLowerCase();
    const latestRows = payload.networkTrend.filter((row) => row.snapshotDate === latestSnapshot);
    const byNetwork = new Map<number, { id: number; asn: number | null; name: string; type: string; capacityMbps: number; metros: Set<string> }>();
    latestRows.forEach((row) => {
      const bucket =
        byNetwork.get(row.networkId) ||
        { id: row.networkId, asn: row.asn, name: row.networkName, type: row.networkType, capacityMbps: 0, metros: new Set<string>() };
      bucket.capacityMbps += row.capacityMbps;
      bucket.metros.add(row.metro);
      byNetwork.set(row.networkId, bucket);
    });
    return Array.from(byNetwork.values())
      .filter((row) => {
        if (!query) return true;
        return `${row.asn || ""} ${row.name}`.toLowerCase().includes(query);
      })
      .sort((a, b) => b.capacityMbps - a.capacityMbps)
      .slice(0, 24);
  }, [latestSnapshot, networkQuery, payload]);

  useEffect(() => {
    if (selectedNetworkId || networkOptions.length === 0) return;
    setSelectedNetworkId(networkOptions[0].id);
  }, [networkOptions, selectedNetworkId]);

  const selectedNetwork = networkOptions.find((row) => row.id === selectedNetworkId) || networkOptions[0] || null;
  const networkComparisonMetros = useMemo(
    () => (visibleMetros.length > 0 ? visibleMetros : networkMetro ? [networkMetro] : []),
    [networkMetro, visibleMetros]
  );
  const networkSeries = useMemo<ChartSeries[]>(() => {
    if (!payload || !selectedNetwork) return [];
    return networkComparisonMetros.map((metro, index) => {
      const rows = payload.networkTrend.filter((row) => row.networkId === selectedNetwork.id && row.metro === metro);
      const values = Object.fromEntries(rows.map((row) => [row.snapshotDate, row.capacityMbps]));
      return {
        key: metro,
        label: metro,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
        values,
      };
    });
  }, [networkComparisonMetros, payload, selectedNetwork]);

  const latestNetworkIxSegments = useMemo(() => {
    if (!payload || !selectedNetwork || !latestSnapshot) return [];
    return networkComparisonMetros
      .map((metro) => {
        const rows = payload.networkIxTrend.filter(
          (row) => row.snapshotDate === latestSnapshot && row.networkId === selectedNetwork.id && row.metro === metro
        );
        const segments = rows
          .sort((a, b) => b.capacityMbps - a.capacityMbps)
          .map((row, index) => ({
            key: `${row.metro}-${row.ixId}`,
            label: row.ixName,
            value: row.capacityMbps,
            color: SERIES_COLORS[index % SERIES_COLORS.length],
          }));
        return { metro, total: segments.reduce((sum, row) => sum + row.value, 0), segments };
      })
      .filter((row) => row.total > 0);
  }, [latestSnapshot, networkComparisonMetros, payload, selectedNetwork]);

  const selectedNetworkMetroIxSeries = useMemo<ChartSeries[]>(() => {
    if (!payload || !selectedNetwork || !networkMetro) return [];
    const rows = payload.networkIxTrend.filter(
      (row) =>
        row.networkId === selectedNetwork.id &&
        row.metro === networkMetro &&
        selectedSnapshotRange.includes(row.snapshotDate)
    );
    const ixNames = Array.from(new Set(rows.map((row) => row.ixName || `IX ${row.ixId}`))).sort((a, b) =>
      a.localeCompare(b)
    );
    return ixNames.map((ixName, index) => {
      const values: Record<string, number> = {};
      selectedSnapshotRange.forEach((date) => {
        values[date] = rows
          .filter((row) => (row.ixName || `IX ${row.ixId}`) === ixName && row.snapshotDate === date)
          .reduce((sum, row) => sum + row.capacityMbps, 0);
      });
      return {
        key: ixName,
        label: ixName,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
        values,
      };
    });
  }, [networkMetro, payload, selectedNetwork, selectedSnapshotRange]);

  const selectedNetworkMetroIxLatest = useMemo(() => {
    if (!payload || !selectedNetwork || !networkMetro) return [];
    const latestInRange = selectedSnapshotRange[selectedSnapshotRange.length - 1] || latestSnapshot;
    return payload.networkIxTrend
      .filter(
        (row) =>
          row.snapshotDate === latestInRange &&
          row.networkId === selectedNetwork.id &&
          row.metro === networkMetro
      )
      .sort((a, b) => b.capacityMbps - a.capacityMbps)
      .map((row, index) => ({
        key: `${row.ixId}`,
        label: row.ixName,
        value: row.capacityMbps,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      }));
  }, [latestSnapshot, networkMetro, payload, selectedNetwork, selectedSnapshotRange]);

  const selectedNetworkMetroIxChanges = useMemo(() => {
    if (!payload || !selectedNetwork || !networkMetro || selectedSnapshotRange.length === 0) return [];
    const startDate = selectedSnapshotRange[0];
    const endDate = selectedSnapshotRange[selectedSnapshotRange.length - 1];
    const rows = payload.networkIxTrend.filter(
      (row) =>
        row.networkId === selectedNetwork.id &&
        row.metro === networkMetro &&
        (row.snapshotDate === startDate || row.snapshotDate === endDate)
    );
    const byIx = new Map<string, { ixName: string; before: number; after: number }>();
    rows.forEach((row) => {
      const key = String(row.ixId);
      const bucket = byIx.get(key) || { ixName: row.ixName || `IX ${row.ixId}`, before: 0, after: 0 };
      if (row.snapshotDate === startDate) bucket.before += row.capacityMbps;
      if (row.snapshotDate === endDate) bucket.after += row.capacityMbps;
      byIx.set(key, bucket);
    });
    return Array.from(byIx.values())
      .map((row) => ({
        ...row,
        change: row.after - row.before,
        percentChange: row.before > 0 ? ((row.after - row.before) / row.before) * 100 : row.after > 0 ? 100 : 0,
      }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }, [networkMetro, payload, selectedNetwork, selectedSnapshotRange]);

  const ixRankings = useMemo(() => {
    if (!payload || !latestSnapshot) return [];
    return payload.ixTrend
      .filter((row) => row.snapshotDate === latestSnapshot && effectiveTrendMetros.includes(row.metro))
      .sort((a, b) => b.capacityMbps - a.capacityMbps)
      .slice(0, 30);
  }, [effectiveTrendMetros, latestSnapshot, payload]);

  const facilityRankings = useMemo(() => {
    if (!payload || !latestSnapshot) return [];
    return payload.facilityTrend
      .filter((row) => row.snapshotDate === latestSnapshot && effectiveTrendMetros.includes(row.metro))
      .sort((a, b) => b.networkCount - a.networkCount)
      .slice(0, 30);
  }, [effectiveTrendMetros, latestSnapshot, payload]);

  const diffRows = useMemo(() => {
    if (!payload || !fromSnapshot || !toSnapshot || diffMetros.length === 0) return [];
    const rowsByMetro = diffMetros.flatMap((metro) => {
      const from = new Map<number, NetworkTrendRow>();
      const to = new Map<number, NetworkTrendRow>();
      const buildIxChanges = (networkId: number) => {
        const rows = payload.networkIxTrend.filter(
          (row) =>
            row.metro === metro &&
            row.networkId === networkId &&
            (row.snapshotDate === fromSnapshot || row.snapshotDate === toSnapshot)
        );
        const byIx = new Map<string, { ixName: string; before: number; after: number }>();
        rows.forEach((row) => {
          const key = String(row.ixId);
          const bucket = byIx.get(key) || { ixName: row.ixName || `IX ${row.ixId}`, before: 0, after: 0 };
          if (row.snapshotDate === fromSnapshot) bucket.before += row.capacityMbps;
          if (row.snapshotDate === toSnapshot) bucket.after += row.capacityMbps;
          byIx.set(key, bucket);
        });
        return Array.from(byIx.values())
          .map((row) => ({
            ...row,
            metro,
            ixLabel: diffMetros.length > 1 ? `${metro} · ${row.ixName}` : row.ixName,
            change: row.after - row.before,
          }))
          .filter((row) => row.change !== 0)
          .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
      };
      payload.networkTrend
        .filter((row) => row.metro === metro && (row.snapshotDate === fromSnapshot || row.snapshotDate === toSnapshot))
        .forEach((row) => {
          if (row.snapshotDate === fromSnapshot) from.set(row.networkId, row);
          if (row.snapshotDate === toSnapshot) to.set(row.networkId, row);
        });
      const ids = new Set([...Array.from(from.keys()), ...Array.from(to.keys())]);
      return Array.from(ids).map((id) => {
          const before = from.get(id);
          const after = to.get(id);
          return {
            metro,
            networkId: id,
            asn: after?.asn || before?.asn || null,
            networkName: after?.networkName || before?.networkName || "",
            status: before && after ? "Existing" : after ? "Added" : "Removed",
            beforeCapacity: before?.capacityMbps || 0,
            afterCapacity: after?.capacityMbps || 0,
            capacityChange: (after?.capacityMbps || 0) - (before?.capacityMbps || 0),
            beforeFacilities: before?.facilityCount || 0,
            afterFacilities: after?.facilityCount || 0,
            ixChanges: buildIxChanges(id),
          };
        });
    });
    return rowsByMetro
      .filter((row) => row.status !== "Existing" || row.capacityChange !== 0 || row.beforeFacilities !== row.afterFacilities)
      .sort((a, b) => Math.abs(b.capacityChange) - Math.abs(a.capacityChange))
      .slice(0, 160);
  }, [diffMetros, fromSnapshot, payload, toSnapshot]);

  const diffSummary = useMemo(() => {
    return diffRows.reduce(
      (summary, row) => {
        if (row.status === "Added") summary.addedNetworks += 1;
        if (row.status === "Removed") summary.removedNetworks += 1;
        if (row.capacityChange > 0) {
          summary.upgradedNetworks += 1;
          summary.upgradedCapacityMbps += row.capacityChange;
        }
        if (row.capacityChange < 0) {
          summary.reducedNetworks += 1;
          summary.reducedCapacityMbps += Math.abs(row.capacityChange);
        }
        summary.netCapacityChangeMbps += row.capacityChange;
        summary.dcPresenceChange += row.afterFacilities - row.beforeFacilities;
        return summary;
      },
      {
        addedNetworks: 0,
        removedNetworks: 0,
        upgradedNetworks: 0,
        reducedNetworks: 0,
        upgradedCapacityMbps: 0,
        reducedCapacityMbps: 0,
        netCapacityChangeMbps: 0,
        dcPresenceChange: 0,
      }
    );
  }, [diffRows]);

  const filteredDiffRows = useMemo(() => {
    const filtered = diffRows.filter((row) => {
      if (diffFilter === "upgrades") return row.capacityChange > 0;
      if (diffFilter === "reductions") return row.capacityChange < 0;
      if (diffFilter === "added") return row.status === "Added";
      if (diffFilter === "removed") return row.status === "Removed";
      if (diffFilter === "dc_changes") return row.beforeFacilities !== row.afterFacilities;
      return true;
    });
    return filtered;
  }, [diffFilter, diffRows]);

  const diffChartRows = useMemo(
    () =>
      filteredDiffRows
        .filter((row) => row.capacityChange !== 0)
        .slice()
        .sort((a, b) => Math.abs(b.capacityChange) - Math.abs(a.capacityChange))
        .slice(0, 14),
    [filteredDiffRows]
  );
  const maxDiffAbs = Math.max(1, ...diffChartRows.map((row) => Math.abs(row.capacityChange)));

  const diffHeatmap = useMemo(() => {
    const networks = filteredDiffRows.filter((row) => row.ixChanges.length > 0).slice(0, 18);
    const ixNames = Array.from(
      new Set(networks.flatMap((row) => row.ixChanges.map((ix) => ix.ixLabel)))
    ).sort((a, b) => a.localeCompare(b));
    const maxAbs = Math.max(
      1,
      ...networks.flatMap((row) => row.ixChanges.map((ix) => Math.abs(ix.change)))
    );
    return { networks, ixNames, maxAbs };
  }, [filteredDiffRows]);

  const toggleMetro = (metro: string) => {
    setSelectedMetros((prev) => (prev.includes(metro) ? prev.filter((item) => item !== metro) : [...prev, metro]));
  };

  const toggleDiffMetro = (metro: string) => {
    setDiffMetros((prev) => (prev.includes(metro) ? prev.filter((item) => item !== metro) : [...prev, metro]));
  };

  const exportOverview = () => {
    if (!payload) return;
    downloadCsv("apac-metro-trends.csv", [
      ["snapshot_date", "metro", "country", "deployed_capacity_mbps", "unique_networks", "ix_count", "facility_count", "facility_presences"],
      ...payload.metroTrend.map((row) => [
        row.snapshotDate,
        row.metro,
        row.country,
        row.capacityMbps,
        row.networkCount,
        row.ixCount,
        row.facilityCount,
        row.facilityPresenceCount,
      ]),
    ]);
  };

  const renderView = () => {
    if (!payload) return null;

    if (activeView === "network") {
      return (
        <>
          <section style={cardStyle}>
            <div style={sectionTitle}>Network trend</div>
            <div style={{ color: shell.muted, marginBottom: 14 }}>
              Search by ASN or network name, then compare the selected network's APAC capacity over time.
            </div>
            <input
              value={networkQuery}
              onChange={(event) => {
                setNetworkQuery(event.target.value);
                setSelectedNetworkId(null);
              }}
              placeholder="Search ASN or network name..."
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {networkOptions.slice(0, 10).map((network) => (
                <button
                  key={network.id}
                  type="button"
                  onClick={() => setSelectedNetworkId(network.id)}
                  style={pillStyle(selectedNetwork?.id === network.id, "#38bdf8")}
                >
                  AS{network.asn || "?"} {network.name || "Unknown"}
                </button>
              ))}
            </div>
          </section>
          {selectedNetwork && (
            <section style={cardStyle}>
              <div style={sectionTitle}>AS{selectedNetwork.asn} {selectedNetwork.name}</div>
              <div style={{ color: shell.muted, marginBottom: 16 }}>
                First chart compares total capacity by metro. Use the controls below for IX-by-IX trend inside one metro.
              </div>
              <LineChart snapshots={selectedSnapshotRange} series={networkSeries} formatter={formatCapacity} />

              <div
                style={{
                  marginTop: 18,
                  padding: 14,
                  borderRadius: 14,
                  border: `1px solid ${shell.border}`,
                  background: shell.panel2,
                }}
              >
                <div style={{ ...sectionTitle, fontSize: 18 }}>IX capacity trend in one metro</div>
                <div style={{ color: shell.muted, marginBottom: 12 }}>
                  Select a metro and timeframe to see how this network's deployed capacity changes across individual IXs.
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(180px, 1fr))",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <label style={labelStyle}>Metro</label>
                    <select value={networkMetro} onChange={(event) => setNetworkMetro(event.target.value)} style={inputStyle}>
                      {metros.map((metro) => (
                        <option key={metro.key} value={metro.key}>
                          {metro.key}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Start snapshot</label>
                    <select
                      value={networkStartSnapshot}
                      onChange={(event) => setNetworkStartSnapshot(event.target.value)}
                      style={inputStyle}
                    >
                      {snapshots.map((date) => (
                        <option key={date} value={date}>
                          {date}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>End snapshot</label>
                    <select
                      value={networkEndSnapshot}
                      onChange={(event) => setNetworkEndSnapshot(event.target.value)}
                      style={inputStyle}
                    >
                      {snapshots.map((date) => (
                        <option key={date} value={date}>
                          {date}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedNetworkMetroIxSeries.length > 0 ? (
                  <>
                    <LineChart
                      snapshots={selectedSnapshotRange}
                      series={selectedNetworkMetroIxSeries}
                      formatter={formatCapacity}
                    />
                    <div
                      style={{
                        marginTop: 14,
                        padding: 12,
                        borderRadius: 12,
                        border: `1px solid ${shell.border}`,
                        background: "#07101d",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 4 }}>Where did capacity change?</div>
                          <div style={{ color: shell.muted, fontSize: 13 }}>
                            Comparing {selectedSnapshotRange[0]} to{" "}
                            {selectedSnapshotRange[selectedSnapshotRange.length - 1]} for {networkMetro}.
                          </div>
                        </div>
                        <div style={{ color: shell.soft, fontWeight: 800 }}>
                          Total change:{" "}
                          {formatCapacityDelta(
                            selectedNetworkMetroIxChanges.reduce((sum, row) => sum + row.change, 0)
                          )}
                        </div>
                      </div>
                      <DataTable
                        headers={["IX", "Start capacity", "End capacity", "Change", "% change"]}
                        rows={selectedNetworkMetroIxChanges.map((row) => [
                          row.ixName,
                          formatCapacity(row.before),
                          formatCapacity(row.after),
                          formatCapacityDelta(row.change),
                          `${row.percentChange >= 0 ? "+" : ""}${row.percentChange.toFixed(1)}%`,
                        ])}
                      />
                    </div>
                    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <strong>{networkMetro} latest IX split</strong>
                        <strong>
                          {formatCapacity(selectedNetworkMetroIxLatest.reduce((sum, row) => sum + row.value, 0))}
                        </strong>
                      </div>
                      <StackedBar
                        segments={selectedNetworkMetroIxLatest}
                        total={selectedNetworkMetroIxLatest.reduce((sum, row) => sum + row.value, 0)}
                      />
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", color: shell.muted, fontSize: 13 }}>
                        {selectedNetworkMetroIxLatest.map((segment) => (
                          <span key={segment.key}>
                            <span style={{ color: segment.color }}>■</span> {segment.label}: {formatCapacity(segment.value)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ color: shell.muted, padding: 14, border: `1px solid ${shell.border}`, borderRadius: 12 }}>
                    No IX deployment found for this network in {networkMetro} within the selected timeframe.
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
                <div style={sectionTitle}>Latest IX split across selected metros</div>
                {latestNetworkIxSegments.map((metro) => (
                  <div key={metro.metro}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <strong>{metro.metro}</strong>
                      <strong>{formatCapacity(metro.total)}</strong>
                    </div>
                    <StackedBar segments={metro.segments} total={metro.total} />
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, color: shell.muted, fontSize: 13 }}>
                      {metro.segments.map((segment) => (
                        <span key={segment.key}>
                          <span style={{ color: segment.color }}>■</span> {segment.label}: {formatCapacity(segment.value)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      );
    }

    if (activeView === "diff") {
      return (
        <section style={cardStyle}>
          <div style={sectionTitle}>Market changes</div>
          <div style={{ color: shell.muted, marginBottom: 14 }}>
            Compare two snapshots across one or more APAC metros. This highlights network additions/removals, IX capacity changes, and DC presence movement.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>From snapshot</label>
              <select value={fromSnapshot} onChange={(event) => setFromSnapshot(event.target.value)} style={inputStyle}>
                {snapshots.map((date) => <option key={date} value={date}>{date}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>To snapshot</label>
              <select value={toSnapshot} onChange={(event) => setToSnapshot(event.target.value)} style={inputStyle}>
                {snapshots.map((date) => <option key={date} value={date}>{date}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              <div>
                <div style={labelStyle}>Markets / metros</div>
                <div style={{ color: shell.muted, fontSize: 13 }}>
                  Select one or more metros for this change comparison.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setDiffMetros(metros.map((metro) => metro.key))} style={buttonStyle}>
                  Select all markets
                </button>
                <button type="button" onClick={() => setDiffMetros([])} style={buttonStyle}>
                  Clear markets
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {metros.map((metro, index) => (
                <button
                  key={metro.key}
                  type="button"
                  onClick={() => toggleDiffMetro(metro.key)}
                  style={pillStyle(diffMetros.includes(metro.key), SERIES_COLORS[index % SERIES_COLORS.length])}
                >
                  {metro.key}
                </button>
              ))}
            </div>
            {diffMetros.length === 0 && (
              <div style={{ color: "#fecaca", marginTop: 8, fontSize: 13 }}>
                Select at least one metro to build market changes.
              </div>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <SummaryTile label="Added networks" value={diffSummary.addedNetworks} accent="#22c55e" />
            <SummaryTile label="Removed networks" value={diffSummary.removedNetworks} accent="#f97316" />
            <SummaryTile label="Upgraded capacity" value={formatCapacity(diffSummary.upgradedCapacityMbps)} accent="#38bdf8" />
            <SummaryTile label="Reduced capacity" value={formatCapacity(diffSummary.reducedCapacityMbps)} accent="#fb7185" />
            <SummaryTile label="Net capacity change" value={formatCapacityDelta(diffSummary.netCapacityChangeMbps)} accent={diffSummary.netCapacityChangeMbps >= 0 ? "#22c55e" : "#fb7185"} />
            <SummaryTile label="DC presence change" value={`${diffSummary.dcPresenceChange >= 0 ? "+" : ""}${diffSummary.dcPresenceChange}`} accent="#f59e0b" />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {[
              ["all", "All movers"],
              ["upgrades", "Top upgrades"],
              ["reductions", "Top reductions"],
              ["added", "New networks"],
              ["removed", "Removed networks"],
              ["dc_changes", "DC changes"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDiffFilter(key as DiffFilter)}
                style={pillStyle(diffFilter === key, key === "reductions" || key === "removed" ? "#fb7185" : "#38bdf8")}
              >
                {label}
              </button>
            ))}
          </div>
          {diffChartRows.length > 0 && (
            <div
              style={{
                border: `1px solid ${shell.border}`,
                borderRadius: 14,
                background: shell.panel2,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Capacity delta by network</div>
              <div style={{ color: shell.muted, fontSize: 13, marginBottom: 12 }}>
                Positive bars show upgrades; negative bars show capacity reductions across the selected snapshot period.
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {diffChartRows.map((row) => {
                  const pct = Math.max(3, (Math.abs(row.capacityChange) / maxDiffAbs) * 50);
                  const isPositive = row.capacityChange >= 0;
                  return (
                    <div
                      key={`${row.metro}-${row.networkId}-${row.capacityChange}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(180px, 280px) minmax(280px, 1fr) 110px",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ color: shell.soft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {diffMetros.length > 1 ? `${row.metro} · ` : ""}{row.networkName || `AS${row.asn || row.networkId}`}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          alignItems: "center",
                          gap: 0,
                        }}
                      >
                        <div style={{ height: 22, display: "flex", justifyContent: "flex-end", borderRight: `1px solid ${shell.border}` }}>
                          {!isPositive && (
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                borderRadius: "999px 0 0 999px",
                                background: "linear-gradient(90deg, #7f1d1d, #fb7185)",
                              }}
                              title={`${row.networkName}: ${formatCapacityDelta(row.capacityChange)}`}
                            />
                          )}
                        </div>
                        <div style={{ height: 22, display: "flex", justifyContent: "flex-start" }}>
                          {isPositive && (
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                borderRadius: "0 999px 999px 0",
                                background: "linear-gradient(90deg, #22c55e, #38bdf8)",
                              }}
                              title={`${row.networkName}: ${formatCapacityDelta(row.capacityChange)}`}
                            />
                          )}
                        </div>
                      </div>
                      <div style={{ color: isPositive ? "#bbf7d0" : "#fecaca", fontWeight: 800, textAlign: "right" }}>
                        {formatCapacityDelta(row.capacityChange)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {diffHeatmap.networks.length > 0 && diffHeatmap.ixNames.length > 0 && (
            <div
              style={{
                border: `1px solid ${shell.border}`,
                borderRadius: 14,
                background: shell.panel2,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 4 }}>IX change heat map</div>
              <div style={{ color: shell.muted, fontSize: 13, marginBottom: 12 }}>
                Rows are changed network/metro pairs. Columns are IXs. Cells show where capacity moved.
              </div>
              <div style={{ overflowX: "auto" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `220px repeat(${diffHeatmap.ixNames.length}, minmax(110px, 1fr))`,
                    minWidth: Math.max(760, 220 + diffHeatmap.ixNames.length * 120),
                    border: `1px solid ${shell.border}`,
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <div style={heatmapHeaderCellStyle}>Network</div>
                  {diffHeatmap.ixNames.map((ixName) => (
                    <div key={ixName} style={heatmapHeaderCellStyle} title={ixName}>
                      {ixName}
                    </div>
                  ))}
                  {diffHeatmap.networks.map((row) => {
                    const ixByName = new Map(row.ixChanges.map((ix) => [ix.ixLabel, ix]));
                    return (
                      <React.Fragment key={`heat-${row.metro}-${row.networkId}`}>
                        <div style={heatmapNetworkCellStyle}>
                          <strong>{row.networkName || `AS${row.asn || row.networkId}`}</strong>
                          <span style={{ color: shell.muted, fontSize: 12 }}>
                            {row.metro} · {row.asn ? `AS${row.asn}` : `ID ${row.networkId}`}
                          </span>
                        </div>
                        {diffHeatmap.ixNames.map((ixName) => {
                          const ix = ixByName.get(ixName);
                          const change = ix?.change || 0;
                          const intensity = Math.min(0.95, Math.max(0.15, Math.abs(change) / diffHeatmap.maxAbs));
                          const bg =
                            change > 0
                              ? `rgba(34, 197, 94, ${intensity})`
                              : change < 0
                                ? `rgba(248, 113, 113, ${intensity})`
                                : "#07101d";
                          return (
                            <div
                              key={`${row.metro}-${row.networkId}-${ixName}`}
                              style={{
                                padding: "10px 8px",
                                borderBottom: `1px solid ${shell.grid}`,
                                borderRight: `1px solid ${shell.grid}`,
                                minHeight: 40,
                                background: bg,
                                color: change === 0 ? shell.muted : "#f8fafc",
                                fontWeight: change === 0 ? 500 : 900,
                                textAlign: "center",
                              }}
                              title={
                                ix
                                  ? `${row.networkName} · ${ixName}: ${formatCapacity(ix.before)} to ${formatCapacity(ix.after)} (${formatCapacityDelta(ix.change)})`
                                  : `${row.networkName} · ${ixName}: no change`
                              }
                            >
                              {change !== 0 ? formatCapacityDelta(change) : "—"}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, color: shell.muted, fontSize: 13 }}>
                <span><span style={{ color: "#22c55e" }}>■</span> Increase</span>
                <span><span style={{ color: "#fb7185" }}>■</span> Decrease</span>
                <span>Stronger color = larger capacity delta</span>
              </div>
            </div>
          )}
          <DataTable
            headers={["Metro", "ASN", "Network", "Change", "Capacity before", "Capacity after", "Delta", "IX movement", "DC before", "DC after"]}
            rows={filteredDiffRows.map((row) => [
              row.metro,
              row.asn ? `AS${row.asn}` : "",
              row.networkName,
              row.status,
              formatCapacity(row.beforeCapacity),
              formatCapacity(row.afterCapacity),
              formatCapacityDelta(row.capacityChange),
              row.ixChanges.length > 0
                ? row.ixChanges
                    .slice(0, 4)
                    .map((ix) => `${ix.ixName} ${formatCapacityDelta(ix.change)}`)
                    .join(" | ") + (row.ixChanges.length > 4 ? ` | +${row.ixChanges.length - 4} more` : "")
                : "No IX capacity change",
              row.beforeFacilities,
              row.afterFacilities,
            ])}
          />
        </section>
      );
    }

    if (activeView === "ix") {
      return (
        <section style={cardStyle}>
          <div style={sectionTitle}>IX capacity ranking</div>
          <div style={{ color: shell.muted, marginBottom: 14 }}>
            Latest deployed capacity by IX. Use the metro selector above to narrow this ranking, or leave all metros unselected to show all APAC.
          </div>
          <div
            style={{
              border: `1px solid ${shell.border}`,
              borderRadius: 14,
              background: shell.panel2,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Top IXs by deployed capacity · {latestSnapshot}</div>
            <HorizontalMetricBars
              rows={ixRankings.slice(0, 12).map((row) => ({
                key: `${row.metro}-${row.ixId}`,
                label: row.ixName,
                sublabel: `${row.metro} · ${formatCount(row.networkCount)} networks`,
                value: row.capacityMbps,
              }))}
              valueFormatter={formatCapacity}
              accent="#38bdf8"
            />
          </div>
          <DataTable
            headers={["Metro", "IX", "Capacity", "Networks"]}
            rows={ixRankings.map((row) => [row.metro, row.ixName, formatCapacity(row.capacityMbps), row.networkCount])}
          />
        </section>
      );
    }

    if (activeView === "facility") {
      return (
        <section style={cardStyle}>
          <div style={sectionTitle}>Facility presence ranking</div>
          <div style={{ color: shell.muted, marginBottom: 14 }}>
            Latest network presence by facility/DC. Use the metro selector above to narrow this ranking, or leave all metros unselected to show all APAC.
          </div>
          <div
            style={{
              border: `1px solid ${shell.border}`,
              borderRadius: 14,
              background: shell.panel2,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Top facilities by network presence · {latestSnapshot}</div>
            <HorizontalMetricBars
              rows={facilityRankings.slice(0, 12).map((row) => ({
                key: `${row.metro}-${row.facilityId}`,
                label: row.facilityName,
                sublabel: `${row.metro} · ${row.facilityOrgName || "Unknown operator"}`,
                value: row.networkCount,
              }))}
              valueFormatter={formatCount}
              accent="#f59e0b"
            />
          </div>
          <DataTable
            headers={["Metro", "Facility", "Operator", "Networks"]}
            rows={facilityRankings.map((row) => [row.metro, row.facilityName, row.facilityOrgName, row.networkCount])}
          />
        </section>
      );
    }

    return (
      <>
        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={sectionTitle}>APAC metro overview</div>
              <div style={{ color: shell.muted }}>
                Trend across {selectedMetros.length > 0 ? "selected APAC metros" : "all APAC metros"} from stored monthly snapshots. No live PeeringDB fetch is used here.
              </div>
            </div>
            <button type="button" onClick={exportOverview} style={buttonStyle}>
              Export trend CSV
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <SummaryTile label="Capacity" value={formatCapacity(overviewTotals.capacityMbps)} accent="#38bdf8" />
            <SummaryTile label="Unique networks" value={overviewTotals.uniqueNetworks} accent="#22c55e" />
            <SummaryTile label="IXs" value={overviewTotals.ixCount} accent="#a855f7" />
            <SummaryTile label="Facilities" value={overviewTotals.facilityCount} accent="#f59e0b" />
            <SummaryTile label="Network/DC presences" value={overviewTotals.facilityPresenceCount} accent="#14b8a6" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(420px, 1.35fr) minmax(320px, 0.9fr)", gap: 16 }}>
            <div style={{ border: `1px solid ${shell.border}`, borderRadius: 14, background: shell.panel2, padding: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>
                {showMetroComparisonAsPrimary ? "Metro trend comparison" : "Aggregate trend"} · {activeMetric.label}
              </div>
              <div style={{ color: shell.muted, fontSize: 13, marginBottom: 8 }}>
                {showMetroComparisonAsPrimary
                  ? "Each selected metro is shown as its own line."
                  : selectedMetros.length > 8
                    ? "Summed across selected metros. Select eight or fewer metros to compare separate lines."
                    : "Summed across all APAC metros."}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8, color: shell.muted, fontSize: 13 }}>
                {primaryOverviewSeries.map((series) => (
                  <span key={series.key}>
                    <span style={{ color: series.color }}>■</span> {series.label}
                  </span>
                ))}
              </div>
              <LineChart
                snapshots={snapshots}
                series={primaryOverviewSeries}
                formatter={(value) => formatMetric(value, activeMetric.format)}
              />
            </div>
            <div style={{ border: `1px solid ${shell.border}`, borderRadius: 14, background: shell.panel2, padding: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Latest metro distribution</div>
              <div style={{ color: shell.muted, fontSize: 13, marginBottom: 12 }}>
                Top metros for {activeMetric.label.toLowerCase()} in {latestSnapshot}.
              </div>
              <HorizontalMetricBars
                rows={overviewTopMetros.map((row) => ({
                  key: row.metro,
                  label: row.metro,
                  sublabel: `${formatCount(row.networkCount)} networks · ${formatCount(row.ixCount)} IXs`,
                  value: safeValue(row[metric]),
                }))}
                valueFormatter={(value) => formatMetric(value, activeMetric.format)}
                accent="#38bdf8"
              />
            </div>
          </div>
          {!showMetroComparisonAsPrimary && selectedMetros.length > 0 && (
            <div style={{ border: `1px solid ${shell.border}`, borderRadius: 14, background: shell.panel2, padding: 14, marginTop: 16 }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Selected metro trend comparison</div>
              <div style={{ color: shell.muted, fontSize: 13, marginBottom: 8 }}>
                Select eight or fewer metros to show separate metro lines here.
              </div>
            </div>
          )}
        </section>
        <section style={cardStyle}>
          <div style={sectionTitle}>Latest snapshot ranking · {latestSnapshot}</div>
          <DataTable
            headers={["Metro", "Capacity", "Networks", "IXs", "Facilities", "Network/DC presences"]}
            rows={latestMetroRows.map((row) => [
              row.metro,
              formatCapacity(row.capacityMbps),
              row.networkCount,
              row.ixCount,
              row.facilityCount,
              row.facilityPresenceCount,
            ])}
          />
        </section>
      </>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: shell.bg, color: shell.text, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>
      <div style={{ maxWidth: 1420, margin: "0 auto", padding: "24px 20px 44px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 800 }}>APAC Trends</div>
            <div style={{ color: shell.muted, marginTop: 6 }}>
              Compare metro, IX, facility, and network movement across stored PeeringDB snapshots.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to="/" style={navLinkStyle}>Back to dashboard</Link>
            <Link to="/downloads" style={navLinkStyle}>Downloads</Link>
          </div>
        </header>

        {loading && <section style={cardStyle}>Loading APAC trend history from stored snapshots…</section>}
        {error && <section style={{ ...cardStyle, color: "#fecaca", borderColor: "#b91c1c" }}>{error}</section>}

        {payload && (
          <>
            <section style={cardStyle}>
              <div style={{ display: "grid", gridTemplateColumns: activeView === "overview" ? "1.2fr 1fr" : "1fr", gap: 18 }}>
                <div>
                  <div style={sectionTitle}>Trend workspace</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {[
                      ["overview", "APAC overview"],
                      ["network", "Network trend"],
                      ["diff", "Market changes"],
                      ["ix", "IX ranking"],
                      ["facility", "Facility ranking"],
                    ].map(([key, label]) => (
                      <button key={key} type="button" onClick={() => setActiveView(key as TrendView)} style={pillStyle(activeView === key, "#38bdf8")}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {activeView === "overview" && (
                  <div>
                    <label style={labelStyle}>Overview metric</label>
                    <select value={metric} onChange={(event) => setMetric(event.target.value as MetricKey)} style={inputStyle}>
                      {metricOptions.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                    <div style={{ color: shell.muted, fontSize: 12, marginTop: 6 }}>
                      This only changes the APAC overview charts. Other tabs use fixed, purpose-built metrics.
                    </div>
                  </div>
                )}
              </div>
              {activeView !== "diff" && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={labelStyle}>Metros</div>
                      <div style={{ color: shell.muted, fontSize: 13, marginBottom: 8 }}>
                        {activeView === "network"
                          ? "Optional comparison filter for the network trend. The IX drill-down has its own metro selector."
                          : "Optional filter for overview and rankings. Leave blank to show all APAC metros."}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedMetros(metros.map((metro) => metro.key))}
                        style={buttonStyle}
                      >
                        Select all metros
                      </button>
                      <button type="button" onClick={() => setSelectedMetros([])} style={buttonStyle}>
                        Deselect all
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {metros.map((metro, index) => (
                      <button
                        key={metro.key}
                        type="button"
                        onClick={() => toggleMetro(metro.key)}
                        style={pillStyle(visibleMetros.includes(metro.key), SERIES_COLORS[index % SERIES_COLORS.length])}
                      >
                        {metro.key}
                      </button>
                    ))}
                  </div>
                  {selectedMetros.length === 0 && activeView !== "network" && (
                    <div style={{ color: shell.muted, marginTop: 8, fontSize: 13 }}>
                      No metro filter selected, so this view is showing all APAC metros.
                    </div>
                  )}
                </div>
              )}
              <div style={{ color: shell.muted, marginTop: 12, fontSize: 13 }}>
                Snapshots loaded: {snapshots.join(" · ") || "none"}
              </div>
              {payload.skippedSnapshots && payload.skippedSnapshots.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #a16207",
                    background: "#2f2108",
                    color: "#fde68a",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  Skipped incomplete snapshots:{" "}
                  {payload.skippedSnapshots
                    .map((snapshot) => `${snapshot.snapshotDate} (${snapshot.reason})`)
                    .join(" · ")}
                </div>
              )}
            </section>

            {snapshots.length > 0 && renderView()}
          </>
        )}
      </div>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${shell.border}`, borderRadius: 14 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} style={{ padding: "12px 14px", textAlign: "left", borderBottom: `1px solid ${shell.border}`, color: shell.soft, background: "#0b1120" }}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} style={{ padding: 16, color: shell.muted }}>No rows for this selection.</td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} style={{ background: rowIndex % 2 ? "#0b1220" : "#07101d" }}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} style={{ padding: "11px 14px", borderBottom: `1px solid ${shell.grid}`, color: cellIndex === 0 ? shell.text : shell.soft }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div
      style={{
        border: `1px solid ${shell.border}`,
        borderRadius: 14,
        padding: "12px 14px",
        background: "#0b1220",
        borderTop: `3px solid ${accent}`,
      }}
    >
      <div style={{ color: shell.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ color: shell.text, fontSize: 22, fontWeight: 900, marginTop: 6 }}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: shell.panel,
  border: `1px solid ${shell.border}`,
  borderRadius: 18,
  padding: 18,
  marginBottom: 18,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  marginBottom: 4,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: shell.muted,
  fontSize: 13,
  marginBottom: 7,
};

const heatmapHeaderCellStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: `1px solid ${shell.border}`,
  borderRight: `1px solid ${shell.grid}`,
  color: shell.soft,
  background: "#0b1120",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const heatmapNetworkCellStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: `1px solid ${shell.grid}`,
  borderRight: `1px solid ${shell.border}`,
  background: "#07101d",
  color: shell.text,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  overflow: "hidden",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#020617",
  color: shell.text,
  border: `1px solid ${shell.border}`,
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 15,
};

const buttonStyle: React.CSSProperties = {
  background: "#0f172a",
  color: shell.text,
  border: `1px solid ${shell.border}`,
  borderRadius: 999,
  padding: "9px 13px",
  cursor: "pointer",
  fontWeight: 700,
};

const navLinkStyle: React.CSSProperties = {
  ...buttonStyle,
  textDecoration: "none",
  display: "inline-flex",
};

const pillStyle = (active: boolean, accent: string): React.CSSProperties => ({
  border: `1px solid ${active ? accent : shell.border}`,
  background: active ? `${accent}24` : "#0f172a",
  color: active ? shell.text : shell.soft,
  borderRadius: 999,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
});
