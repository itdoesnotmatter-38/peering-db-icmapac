import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { fetchPeeringDb, type PeeringDbParams } from "./peeringdbApi";
import { withApiRoot } from "./apiBase";

/**
 * Theme – dark but with clearer contrast and borders.
 */
const theme = {
  appBg: "#020617",
  headerBg: "#020617",
  headerBorder: "#1f2937",
  cardBg: "#020617",
  cardBgElevated: "#06101f",
  cardBorder: "#4b5563",
  metroCardBg: "#020617",
  metroCardBorder: "#22c55e",
  metroCardAccent: "#22c55e",
  tableHeaderBg: "#0b1120",
  tableHeaderBorder: "#4b5563",
  tableRowAlt1: "#020617",
  tableRowAlt2: "#111827",
  gridBorder: "#4b5563",
  textPrimary: "#e5e7eb",
  textSecondary: "#cbd5e1",
  textMuted: "#a8b3c7",
  textSoft: "#94a3b8",
  ixPresentBg: "#14532d",
  ixPresentFg: "#bbf7d0",
  ixAbsentFg: "#6b7280",
  capacityAccent: "#38bdf8",
  capacityAccentSoft: "#bae6fd",
  capacityBadgeBg: "#082f49",
  facilityAccent: "#f59e0b",
  facilityAccentSoft: "#fde68a",
  facilityBadgeBg: "#78350f",
  successAccent: "#22c55e",
  successAccentSoft: "#dcfce7",
  warningAccent: "#f59e0b",
  dangerAccent: "#ef4444",
  selectedRowBg: "rgba(56, 189, 248, 0.12)",
  bothBg: "#14532d",
  bothFg: "#dcfce7",
  ixOnlyBg: "#082f49",
  ixOnlyFg: "#bae6fd",
  facilityOnlyBg: "#78350f",
  facilityOnlyFg: "#fde68a",
  absentBg: "#1f2937",
  absentFg: "#cbd5e1",
  pillBg: "#020617",
  pillBorder: "#4b5563",
};

/**
 * Metro presets.
 */
type MetroRegion = "APAC" | "EMEA" | "AMER";

const METROS = {
  Singapore: { country: "SG", city: "Singapore", region: "APAC" as MetroRegion },
  Jakarta: { country: "ID", city: "Jakarta", region: "APAC" as MetroRegion },
  "Kuala Lumpur": { country: "MY", city: "Kuala Lumpur", region: "APAC" as MetroRegion },
  Melbourne: { country: "AU", city: "Melbourne", region: "APAC" as MetroRegion },
  Sydney: { country: "AU", city: "Sydney", region: "APAC" as MetroRegion },
  Mumbai: { country: "IN", city: "Mumbai", region: "APAC" as MetroRegion },
  "Hong Kong": { country: "HK", city: "Hong Kong", region: "APAC" as MetroRegion },
  Bangkok: { country: "TH", city: "Bangkok", region: "APAC" as MetroRegion },
  Manila: { country: "PH", city: "Manila", region: "APAC" as MetroRegion },
  Chennai: { country: "IN", city: "Chennai", region: "APAC" as MetroRegion },
  Seoul: { country: "KR", city: "Seoul", region: "APAC" as MetroRegion },
  Tokyo: { country: "JP", city: "Tokyo", region: "APAC" as MetroRegion },
  Osaka: { country: "JP", city: "Osaka", region: "APAC" as MetroRegion },
  Perth: { country: "AU", city: "Perth", region: "APAC" as MetroRegion },

  London: { country: "GB", city: "London", region: "EMEA" as MetroRegion },
  Amsterdam: { country: "NL", city: "Amsterdam", region: "EMEA" as MetroRegion },
  Frankfurt: { country: "DE", city: "Frankfurt", region: "EMEA" as MetroRegion },
  Paris: { country: "FR", city: "Paris", region: "EMEA" as MetroRegion },
  Marseille: { country: "FR", city: "Marseille", region: "EMEA" as MetroRegion },
  Madrid: { country: "ES", city: "Madrid", region: "EMEA" as MetroRegion },

  Ashburn: { country: "US", city: "Ashburn", region: "AMER" as MetroRegion },
  "New York": { country: "US", city: "New York", region: "AMER" as MetroRegion },
  Chicago: { country: "US", city: "Chicago", region: "AMER" as MetroRegion },
  Dallas: { country: "US", city: "Dallas", region: "AMER" as MetroRegion },
  "Los Angeles": { country: "US", city: "Los Angeles", region: "AMER" as MetroRegion },
  Miami: { country: "US", city: "Miami", region: "AMER" as MetroRegion },
} as const;

type MetroKey = keyof typeof METROS;

const REGION_ORDER: MetroRegion[] = ["APAC", "EMEA", "AMER"];
const METROS_BY_REGION: Record<MetroRegion, MetroKey[]> = REGION_ORDER.reduce(
  (acc, region) => {
    acc[region] = (Object.keys(METROS) as MetroKey[]).filter((metro) => METROS[metro].region === region);
    return acc;
  },
  { APAC: [], EMEA: [], AMER: [] } as Record<MetroRegion, MetroKey[]>
);

interface MetroNetwork {
  netId: number;
  asn?: number;
  name?: string; // PeeringDB net.name (organization)
  networkType?: string;
  orgId?: number;
  orgName?: string;
  originCountry?: string;
  originCity?: string;
  ixCaps: Map<number, number>; // ix_id -> total capacity Mbps (0 = unknown)
  facIds: Set<number>;
}

interface CapacitySegment {
  ixId: number;
  ixName: string;
  gbps: number;
}

interface CapacityRow {
  net: MetroNetwork;
  segments: CapacitySegment[];
  totalGbps: number;
}

interface SnapshotRun {
  snapshotDate: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  netCount: number | null;
  orgCount: number | null;
  netUrl: string | null;
  orgUrl: string | null;
  manifestUrl: string | null;
  networksCsvUrl: string | null;
}

interface NetDetailCacheEntry {
  asn: number | null;
  name: string;
  networkType: string;
  orgId: number | null;
  orgName: string;
  originCountry: string;
  originCity: string;
}

interface NetworkOrgCacheEntry {
  name: string;
  country: string;
  city: string;
}

type DashboardView = "matrices" | "compare" | "insights";
type GapFilterMode =
  | "all"
  | "missing_somewhere"
  | "present_in_all"
  | "only_one_metro"
  | "present_in_source_not_target";

type GapSortField =
  | "asn"
  | "name"
  | "present_count"
  | "source_capacity"
  | "source_facility_presence";

interface MetroPresenceSummary {
  ixPresent: boolean;
  facilityPresent: boolean;
  capacityGbps: number;
  facilityPresenceCount: number;
}

interface PresenceGapRow {
  net: MetroNetwork;
  metroStates: Record<MetroKey, MetroPresenceSummary>;
  presentMetroCount: number;
  metroFootprint: string[];
}

type InsightsDataset = "metro_summary" | "network_metro" | "ix_deployment" | "facility_presence";
type InsightsChartType = "bar" | "stacked_bar" | "heatmap" | "table";
type InsightValueScale = "auto" | "linear" | "log";
type InsightTemplate =
  | "capacity_by_metro"
  | "ix_split_for_networks"
  | "top_networks"
  | "origin_analysis"
  | "facility_footprint";

interface InsightFieldOption {
  key: string;
  label: string;
}

interface InsightMetricOption extends InsightFieldOption {
  format: "capacity" | "count";
}

type InsightRecordValue = string | number;
type InsightRecord = Record<string, InsightRecordValue>;

interface InsightDatasetDefinition {
  key: InsightsDataset;
  label: string;
  description: string;
  rows: InsightRecord[];
  dimensions: InsightFieldOption[];
  metrics: InsightMetricOption[];
  seriesOptions: InsightFieldOption[];
  tableFields: InsightFieldOption[];
  defaultCategory: string;
  defaultMetric: string;
  defaultSeries: string;
  defaultChart: InsightsChartType;
}

type InsightGuidanceAction =
  | "switch_to_table"
  | "switch_to_bar"
  | "switch_to_stacked_bar"
  | "switch_to_heatmap"
  | "set_category_network_name"
  | "set_category_origin_country"
  | "set_series_ix"
  | "set_series_metro"
  | "clear_metro_filter"
  | "clear_all_filters";

type MetroLoadStatus = "queued" | "cached" | "loading" | "ready" | "error";

interface LoadProgressState {
  step: number;
  totalSteps: number;
  stageLabel: string;
  detail: string;
  progressCurrent: number;
  progressTotal: number;
  throttleMessage: string | null;
  metroStatuses: Partial<Record<MetroKey, MetroLoadStatus>>;
}

const buildSnapshotCsvUrl = (snapshotDate: string) =>
  withApiRoot(`/api/snapshots/csv?snapshotDate=${encodeURIComponent(snapshotDate)}`);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const formatWaitSeconds = (ms: number) => `${Math.max(1, Math.ceil(ms / 1000))}s`;
const integerFormatter = new Intl.NumberFormat("en-US");
const oneDecimalFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});
const REQUEST_GAP_MS = 500;
const DETAIL_REQUEST_GAP_MS = 1200;
const DETAIL_FETCH_ATTEMPTS = 25;
const ORG_CHUNK_SIZE = 50;
const IX_CHUNK_SIZE = 10;
const FAC_CHUNK_SIZE = 10;
const NET_CHUNK_SIZE = 40;

const formatCount = (value: number) => integerFormatter.format(value);

const formatCapacity = (gbps: number) => {
  if (!Number.isFinite(gbps) || gbps <= 0) return "0 Gbps";
  if (gbps >= 1000) return `${oneDecimalFormatter.format(gbps / 1000)} Tbps`;
  if (gbps >= 100) return `${formatCount(Math.round(gbps))} Gbps`;
  return `${oneDecimalFormatter.format(gbps)} Gbps`;
};

const parseThrottleWaitMs = (message: string): number | null => {
  const match = message.match(/Expected available in (\d+)\s*seconds?/i);
  if (!match) return null;
  const seconds = Number.parseInt(match[1], 10);
  if (!Number.isFinite(seconds)) return null;
  return Math.min((seconds + 1) * 1000, 45000);
};

const fetchPeeringDbWithRetry = async <T,>(
  obj: string,
  params: PeeringDbParams = {},
  maxAttempts = 10,
  options?: {
    onThrottleWait?: (info: { message: string; waitMs: number; attempt: number }) => void;
  }
) => {
  let attempt = 0;
  let lastErr: any = null;

  while (attempt < maxAttempts) {
    try {
      return await fetchPeeringDb<T>(obj, params);
    } catch (err: any) {
      lastErr = err;
      const message = err?.message || String(err);
      const throttled = /throttled/i.test(message);
      if (!throttled || attempt === maxAttempts - 1) {
        throw err;
      }
      const waitMs = parseThrottleWaitMs(message) ?? Math.min(1000 * 2 ** attempt, 30000);
      options?.onThrottleWait?.({ message, waitMs, attempt: attempt + 1 });
      await sleep(waitMs);
    }
    attempt += 1;
  }

  throw lastErr || new Error("PeeringDB request failed.");
};

const DEFAULT_NAME_COL_WIDTH = 220;
const DATA_COL_MIN_WIDTH = 90;
const BASE_TABLE_MIN_WIDTH = 600;

type SortKey = "asn" | "name" | "ix";

interface SortState {
  key: SortKey;
  direction: "asc" | "desc";
  ixId?: number;
}

const HoverCard: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  triggerStyle?: React.CSSProperties;
  wrapperStyle?: React.CSSProperties;
}> = ({ label, children, width = 260, triggerStyle, wrapperStyle }) => {
  const [open, setOpen] = useState(false);

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center", ...wrapperStyle }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span tabIndex={0} style={{ display: "inline-flex", alignItems: "center", outline: "none", ...triggerStyle }}>
        {label}
      </span>
      {open && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "calc(100% + 10px)",
            width,
            padding: 12,
            borderRadius: 12,
            border: `1px solid ${theme.gridBorder}`,
            background: "#06101f",
            boxShadow: "0 18px 36px rgba(0,0,0,0.5)",
            color: theme.textPrimary,
            zIndex: 60,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
};

const PeeringDBDashboard: React.FC = () => {
  // Metro selection for NEXT load.
  const [selectedMetros, setSelectedMetros] = useState<MetroKey[]>(["Singapore"]);
  const [openMetroRegion, setOpenMetroRegion] = useState<MetroRegion | null>("APAC");
  const metroSelectorRef = useRef<HTMLDivElement | null>(null);

  // Metros and timestamp for the LAST successful load.
  const [lastLoadedMetros, setLastLoadedMetros] = useState<MetroKey[]>([]);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  // Cached IX/FAC per metro (so we don't refetch every time).
  const [ixCache, setIxCache] = useState<Partial<Record<MetroKey, any[]>>>({});
  const [facCache, setFacCache] = useState<Partial<Record<MetroKey, any[]>>>({});
  const [netixlanCache, setNetixlanCache] = useState<Partial<Record<MetroKey, any[]>>>({});
  const [netfacCache, setNetfacCache] = useState<Partial<Record<MetroKey, any[]>>>({});
  const [netDetailCache, setNetDetailCache] = useState<Record<number, NetDetailCacheEntry>>({});
  const [networkOrgCache, setNetworkOrgCache] = useState<Record<number, NetworkOrgCacheEntry>>({});

  // Active IX/FAC data for lastLoadedMetros (union).
  const [ixData, setIxData] = useState<any[]>([]);
  const [facData, setFacData] = useState<any[]>([]);

  // Networks (built when you click Load).
  const [metroNetworks, setMetroNetworks] = useState<MetroNetwork[]>([]);

  // Loading / errors.
  const [allNetLoading, setAllNetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allNetError, setAllNetError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<LoadProgressState | null>(null);

  // Filters & sorting.
  const [asnFilterText, setAsnFilterText] = useState("");
  const [nameFilterText, setNameFilterText] = useState("");
  const [sortState, setSortState] = useState<SortState>({ key: "asn", direction: "asc" });

  // IX / facility selection.
  const [selectedIxIds, setSelectedIxIds] = useState<number[]>([]);
  const [selectedFacIds, setSelectedFacIds] = useState<number[]>([]);
  const [ixSearch, setIxSearch] = useState("");
  const [facSearch, setFacSearch] = useState("");

  // Layout tweaks.
  const [nameColWidth, setNameColWidth] = useState<number>(DEFAULT_NAME_COL_WIDTH);
  const [sidebarWidth, setSidebarWidth] = useState<number>(300);
  const [activeView, setActiveView] = useState<DashboardView>("matrices");
  const [insightDataset, setInsightDataset] = useState<InsightsDataset>("metro_summary");
  const [insightChartType, setInsightChartType] = useState<InsightsChartType>("bar");
  const [insightCategoryField, setInsightCategoryField] = useState("metro");
  const [insightMetricKey, setInsightMetricKey] = useState("deployed_capacity_gbps");
  const [insightSeriesField, setInsightSeriesField] = useState("region");
  const [insightValueScale, setInsightValueScale] = useState<InsightValueScale>("auto");
  const [insightSortBy, setInsightSortBy] = useState<"metric" | "category">("metric");
  const [insightSortDirection, setInsightSortDirection] = useState<"asc" | "desc">("desc");
  const [insightTopN, setInsightTopN] = useState<number>(20);
  const [insightSearchText, setInsightSearchText] = useState("");
  const [insightMetroFilter, setInsightMetroFilter] = useState<MetroKey[]>([]);
  const [insightNetworkTypeFilter, setInsightNetworkTypeFilter] = useState<string[]>([]);
  const [insightOriginCountryFilter, setInsightOriginCountryFilter] = useState<string[]>([]);
  const [insightPresenceTypeFilter, setInsightPresenceTypeFilter] = useState<string[]>([]);
  const [selectedInsightTemplate, setSelectedInsightTemplate] = useState<InsightTemplate>("capacity_by_metro");
  const [showInsightFilters, setShowInsightFilters] = useState(false);
  const [showInsightAdvancedFilters, setShowInsightAdvancedFilters] = useState(false);
  const [showInsightChartOptions, setShowInsightChartOptions] = useState(false);
  const [gapFilterMode, setGapFilterMode] = useState<GapFilterMode>("present_in_source_not_target");
  const [gapSourceMetros, setGapSourceMetros] = useState<MetroKey[]>(["Singapore"]);
  const [gapTargetMetros, setGapTargetMetros] = useState<MetroKey[]>(["Jakarta"]);
  const [gapNetworkFilterText, setGapNetworkFilterText] = useState("");
  const [gapSortField, setGapSortField] = useState<GapSortField>("source_capacity");
  const [gapSortDirection, setGapSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedGapNetId, setSelectedGapNetId] = useState<number | null>(null);

  // Facility org lookup.
  const [orgLookup, setOrgLookup] = useState<Record<number, any>>({});
  const [snapshotRuns, setSnapshotRuns] = useState<SnapshotRun[]>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const metroLabel =
    selectedMetros.length === 0
      ? "None"
      : selectedMetros
          .map((m) => `${METROS[m].city} (${METROS[m].country})`)
          .join(", ");

  const selectedCountsByRegion = REGION_ORDER.reduce(
    (acc, region) => {
      acc[region] = selectedMetros.filter((metro) => METROS[metro].region === region).length;
      return acc;
    },
    { APAC: 0, EMEA: 0, AMER: 0 } as Record<MetroRegion, number>
  );

  const loadedMetroLabel =
    lastLoadedMetros.length === 0
      ? "None"
      : lastLoadedMetros
          .map((m) => `${METROS[m].city} (${METROS[m].country})`)
          .join(" + ");

  const loadPercent =
    loadProgress && loadProgress.totalSteps > 0
      ? Math.max(
          6,
          Math.min(
            100,
            ((loadProgress.step - 1 + (loadProgress.progressTotal > 0
              ? loadProgress.progressCurrent / loadProgress.progressTotal
              : 0)) /
              loadProgress.totalSteps) *
              100
          )
        )
      : 0;

  useEffect(() => {
    if (!openMetroRegion) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!metroSelectorRef.current || !target) return;
      if (!metroSelectorRef.current.contains(target)) {
        setOpenMetroRegion(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openMetroRegion]);

  // ---- Facility org classification fallback ----
  const classifyOrgFallback = (name: string | undefined): string => {
    if (!name) return "Other / Unknown";
    const n = name.toLowerCase();

    if (n.includes("equinix")) return "Equinix";
    if (n.includes("ntt")) return "NTT";
    if (n.includes("stt") || n.includes("st telemedia")) return "STT";
    if (n.includes("aims")) return "AIMS";
    if (n.includes("cyber 1") || n.includes("cyber1") || n.includes("apjii")) return "APJII / Cyber1";
    if (n.includes("digital realty")) return "Digital Realty";
    if (n.includes("digital edge")) return "Digital Edge";
    if (n.includes("dci")) return "DCI";

    if (n.includes("csf")) return "CSF Group";
    if (n.includes("telcohub")) return "CSF Group";

    if (n.includes("tm one")) return "TM ONE";
    if (n.includes("measat")) return "MEASAT";
    if (n.includes("safehouse")) return "SAFEHOUSE";

    return "Other / Unknown";
  };

  // ---- Helper: chunk array ----
  function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  // ---- Union IX/FAC for lastLoadedMetros ----
  useEffect(() => {
    const ixArr: any[] = [];
    const facArr: any[] = [];
    const ixSeen = new Set<number>();
    const facSeen = new Set<number>();

    lastLoadedMetros.forEach((m) => {
      const ixList = ixCache[m] || [];
      ixList.forEach((ix) => {
        if (ix && typeof ix.id === "number" && !ixSeen.has(ix.id)) {
          ixSeen.add(ix.id);
          ixArr.push(ix);
        }
      });
      const facList = facCache[m] || [];
      facList.forEach((fac) => {
        if (fac && typeof fac.id === "number" && !facSeen.has(fac.id)) {
          facSeen.add(fac.id);
          facArr.push(fac);
        }
      });
    });

    setIxData(ixArr);
    setFacData(facArr);
  }, [lastLoadedMetros, ixCache, facCache]);

  // Keep IX / FAC selection valid when ixData / facData change.
  useEffect(() => {
    if (ixData.length === 0) {
      setSelectedIxIds([]);
      return;
    }
    const allIds = ixData.map((ix) => ix.id).filter((id: any) => typeof id === "number");
    setSelectedIxIds((prev) => {
      if (prev.length === 0) return allIds;
      const valid = new Set(allIds);
      const filtered = prev.filter((id) => valid.has(id));
      return filtered.length > 0 ? filtered : allIds;
    });
  }, [ixData]);

  useEffect(() => {
    if (facData.length === 0) {
      setSelectedFacIds([]);
      setOrgLookup({});
      return;
    }
    const allIds = facData.map((fac) => fac.id).filter((id: any) => typeof id === "number");
    setSelectedFacIds((prev) => {
      if (prev.length === 0) return allIds;
      const valid = new Set(allIds);
      const filtered = prev.filter((id) => valid.has(id));
      return filtered.length > 0 ? filtered : allIds;
    });
  }, [facData]);

  // Fetch org records for facilities.
  useEffect(() => {
    const fetchOrgs = async () => {
      const orgIds = Array.from(
        new Set(
          facData
            .map((fac) => fac.org_id)
            .filter((id: any) => typeof id === "number")
        )
      );
      if (orgIds.length === 0) {
        setOrgLookup({});
        return;
      }

      try {
        const chunks = chunk(orgIds, ORG_CHUNK_SIZE);
        const acc: Record<number, any> = {};
        for (const ch of chunks) {
          const { data } = await fetchPeeringDbWithRetry<any>("org", {
            id__in: ch.join(","),
          }, DETAIL_FETCH_ATTEMPTS);
          data.forEach((org: any) => {
            if (org && typeof org.id === "number") {
              acc[org.id] = org;
            }
          });
          await sleep(DETAIL_REQUEST_GAP_MS);
        }
        setOrgLookup(acc);
      } catch (e: any) {
        console.warn("Error fetching org data", e);
        setError(e?.message || "Error fetching org data.");
      }
    };

    if (facData.length === 0) {
      setOrgLookup({});
      return;
    }
    fetchOrgs();
  }, [facData]);

  // Reset sort when metros change.
  useEffect(() => {
    setSortState({ key: "asn", direction: "asc" });
  }, [lastLoadedMetros]);

  useEffect(() => {
    if (lastLoadedMetros.length === 0) return;

    setGapSourceMetros((prev) => {
      const valid = prev.filter((metro) => lastLoadedMetros.includes(metro));
      if (valid.length > 0) return valid;
      return [lastLoadedMetros[0]];
    });

    setGapTargetMetros((prev) => {
      const valid = prev.filter((metro) => lastLoadedMetros.includes(metro));
      if (lastLoadedMetros.length <= 1) return [];
      if (valid.length > 0) return valid;
      const fallback = lastLoadedMetros.find((metro) => metro !== lastLoadedMetros[0]);
      return fallback ? [fallback] : [];
    });
  }, [lastLoadedMetros]);

  // Load recent snapshot download links.
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      setSnapshotRuns([]);
      setSnapshotError(null);
      setSnapshotLoading(false);
      return;
    }

    const loadSnapshots = async () => {
      setSnapshotLoading(true);
      setSnapshotError(null);
      try {
        const resp = await fetch(withApiRoot("/api/snapshots/latest?limit=6"));
        const json = await resp.json().catch(() => null);
        if (!resp.ok) {
          throw new Error(json?.error || `Snapshot API error: ${resp.status}`);
        }
        const runs = Array.isArray(json?.runs) ? json.runs : [];
        setSnapshotRuns(runs);
      } catch (e: any) {
        setSnapshotError(e?.message || "Failed to load snapshot downloads.");
      } finally {
        setSnapshotLoading(false);
      }
    };

    loadSnapshots();
  }, []);

  // ---- Load ALL networks for selectedMetros (using cache where possible) ----
  const handleLoadAllNetworks = async () => {
    if (selectedMetros.length === 0) {
      setAllNetError("Select at least one metro.");
      return;
    }

    const metrosToLoad = [...selectedMetros];
    const hasMetroArrayCache = <T,>(cache: Partial<Record<MetroKey, T[]>>, metro: MetroKey) =>
      Array.isArray(cache[metro]);

    setError(null);
    setAllNetError(null);
    setAllNetLoading(true);
    const initialMetroStatuses = metrosToLoad.reduce((acc, metro) => {
      const cachedRaw =
        hasMetroArrayCache(netixlanCache, metro) && hasMetroArrayCache(netfacCache, metro);
      acc[metro] = cachedRaw ? "cached" : "queued";
      return acc;
    }, {} as Partial<Record<MetroKey, MetroLoadStatus>>);

    setLoadProgress({
      step: 1,
      totalSteps: 5,
      stageLabel: "Loading IX and facility lists",
      detail: `Preparing ${metrosToLoad.length} selected metros`,
      progressCurrent: 0,
      progressTotal: metrosToLoad.length,
      throttleMessage: null,
      metroStatuses: initialMetroStatuses,
    });

    let workingIxCache: Partial<Record<MetroKey, any[]>> = { ...ixCache };
    let workingFacCache: Partial<Record<MetroKey, any[]>> = { ...facCache };
    let workingNetixlanCache: Partial<Record<MetroKey, any[]>> = { ...netixlanCache };
    let workingNetfacCache: Partial<Record<MetroKey, any[]>> = { ...netfacCache };
    let workingNetDetailCache: Record<number, NetDetailCacheEntry> = { ...netDetailCache };
    let workingNetworkOrgCache: Record<number, NetworkOrgCacheEntry> = { ...networkOrgCache };

    try {
      const updateLoadProgress = (
        updater: (prev: LoadProgressState) => LoadProgressState
      ) => {
        setLoadProgress((prev) => (prev ? updater(prev) : prev));
      };

      const mergeLoadProgress = (patch: Partial<LoadProgressState>) => {
        updateLoadProgress((prev) => ({
          ...prev,
          ...patch,
        }));
      };

      const reportThrottleWait = (context: string) => ({
        waitMs,
      }: {
        message: string;
        waitMs: number;
        attempt: number;
      }) => {
        updateLoadProgress((prev) => ({
          ...prev,
          throttleMessage: `PeeringDB asked us to wait ${formatWaitSeconds(waitMs)} before retrying ${context}.`,
          detail: `${prev.detail} Retrying after throttle.`,
        }));
      };

      const getMetroReadyStatus = (metro: MetroKey): MetroLoadStatus =>
        hasMetroArrayCache(workingNetixlanCache, metro) && hasMetroArrayCache(workingNetfacCache, metro)
          ? "ready"
          : "queued";

      // Fetch IX/FAC only for metros that are not in cache yet.
      for (let metroIndex = 0; metroIndex < metrosToLoad.length; metroIndex += 1) {
        const m = metrosToLoad[metroIndex];
        const ixList = workingIxCache[m];
        const facList = workingFacCache[m];
        const needsIx = !Array.isArray(ixList);
        const needsFac = !Array.isArray(facList);

        updateLoadProgress((prev) => ({
          ...prev,
          step: 1,
          stageLabel: "Loading IX and facility lists",
          detail:
            !needsIx && !needsFac
              ? `Using cached IX/facility lists for ${m}`
              : `Loading metro ${metroIndex + 1} of ${metrosToLoad.length}: ${m}`,
          progressCurrent: metroIndex + 1,
          progressTotal: metrosToLoad.length,
          throttleMessage: null,
          metroStatuses: {
            ...prev.metroStatuses,
            [m]:
              !needsIx && !needsFac
                ? getMetroReadyStatus(m) === "ready"
                  ? "cached"
                  : "queued"
                : "loading",
          },
        }));

        if (!needsIx && !needsFac) {
          continue;
        }

        const cfg = METROS[m];
        const ixParams = { country: cfg.country, city: cfg.city };
        const facParams =
          cfg.country === "HK" || cfg.country === "SG"
            ? { country: cfg.country }
            : { country: cfg.country, city: cfg.city };

        try {
          const ixResult = needsIx
            ? await fetchPeeringDbWithRetry<any>("ix", ixParams, 10, {
                onThrottleWait: reportThrottleWait(`IX list for ${m}`),
              })
            : { data: ixList || [] };
          if (needsIx && needsFac) {
            await sleep(REQUEST_GAP_MS);
          }
          const facResult = needsFac
            ? await fetchPeeringDbWithRetry<any>("fac", facParams, 10, {
                onThrottleWait: reportThrottleWait(`facility list for ${m}`),
              })
            : { data: facList || [] };
          workingIxCache[m] = ixResult.data || [];
          workingFacCache[m] = facResult.data || [];
          updateLoadProgress((prev) => ({
            ...prev,
            detail: `Ready: ${m} (${workingIxCache[m]?.length ?? 0} IXs, ${workingFacCache[m]?.length ?? 0} facilities)`,
            throttleMessage: null,
            metroStatuses: {
              ...prev.metroStatuses,
              [m]: getMetroReadyStatus(m),
            },
          }));
        } catch (err: any) {
          updateLoadProgress((prev) => ({
            ...prev,
            detail: `Failed while loading ${m}`,
            metroStatuses: {
              ...prev.metroStatuses,
              [m]: "error",
            },
          }));
          throw new Error(
            `Failed to load IX/FAC for ${cfg.city} (${cfg.country}): ${err?.message || err}`
          );
        }
      }

      // Build union IX/FAC for the selectedMetros (for this load).
      const ixArr: any[] = [];
      const facArr: any[] = [];
      const ixSeen = new Set<number>();
      const facSeen = new Set<number>();

      metrosToLoad.forEach((m) => {
        const ixList = workingIxCache[m] || [];
        ixList.forEach((ix) => {
          if (ix && typeof ix.id === "number" && !ixSeen.has(ix.id)) {
            ixSeen.add(ix.id);
            ixArr.push(ix);
          }
        });
        const facList = workingFacCache[m] || [];
        facList.forEach((fac) => {
          if (fac && typeof fac.id === "number" && !facSeen.has(fac.id)) {
            facSeen.add(fac.id);
            facArr.push(fac);
          }
        });
      });

      const ixIds = ixArr.map((ix) => ix.id).filter((id: any) => typeof id === "number");
      const facIds = facArr.map((fac) => fac.id).filter((id: any) => typeof id === "number");

      if (ixIds.length === 0 && facIds.length === 0) {
        setIxCache(workingIxCache);
        setFacCache(workingFacCache);
        setNetixlanCache(workingNetixlanCache);
        setNetfacCache(workingNetfacCache);
        setNetDetailCache(workingNetDetailCache);
        setNetworkOrgCache(workingNetworkOrgCache);
        setAllNetError("No IX or facility IDs found for the selected metros.");
        setLoadProgress((prev) =>
          prev
            ? {
                ...prev,
                step: 1,
                stageLabel: "Nothing to load",
                detail: "No IX or facility IDs were found for the selected metros.",
                throttleMessage: null,
              }
            : prev
        );
        return;
      }

      // ---- Build MetroNetwork map using netixlan + netfac ----
      const netMap = new Map<number, MetroNetwork>();

      // 1) IX presence + capacity via per-metro cached netixlan rows.
      const netixlanPlans = metrosToLoad
        .filter((metro) => !hasMetroArrayCache(workingNetixlanCache, metro))
        .map((metro) => ({
          metro,
          ixIds: (workingIxCache[metro] || [])
            .map((ix) => ix.id)
            .filter((id: any) => typeof id === "number"),
        }));
      const totalNetixlanChunks = netixlanPlans.reduce((sum, plan) => {
        if (plan.ixIds.length === 0) return sum;
        return sum + chunk(plan.ixIds, IX_CHUNK_SIZE).length;
      }, 0);
      updateLoadProgress((prev) => ({
        ...prev,
        step: 2,
        stageLabel: "Loading IX capacity rows",
        detail:
          totalNetixlanChunks === 0
            ? "Using cached IX capacity rows for the selected metros"
            : `Fetching IX capacity rows for ${netixlanPlans.length} metro${netixlanPlans.length === 1 ? "" : "s"}`,
        progressCurrent: 0,
        progressTotal: totalNetixlanChunks,
        throttleMessage: null,
      }));
      if (totalNetixlanChunks === 0) {
        metrosToLoad.forEach((metro) => {
          if (!hasMetroArrayCache(workingNetixlanCache, metro)) {
            workingNetixlanCache[metro] = [];
          }
        });
      } else {
        let completedNetixlanChunks = 0;
        for (const plan of netixlanPlans) {
          const { metro, ixIds: metroIxIds } = plan;
          if (metroIxIds.length === 0) {
            workingNetixlanCache[metro] = [];
            updateLoadProgress((prev) => ({
              ...prev,
              metroStatuses: {
                ...prev.metroStatuses,
                [metro]: getMetroReadyStatus(metro),
              },
            }));
            continue;
          }

          const metroRows: any[] = [];
          const ixChunks = chunk(metroIxIds, IX_CHUNK_SIZE);
          updateLoadProgress((prev) => ({
            ...prev,
            detail: `Loading IX capacity rows for ${metro}`,
            throttleMessage: null,
            metroStatuses: {
              ...prev.metroStatuses,
              [metro]: "loading",
            },
          }));

          for (let chunkIndex = 0; chunkIndex < ixChunks.length; chunkIndex += 1) {
            const ch = ixChunks[chunkIndex];
            const param = ch.join(",");
            const progressCurrent = completedNetixlanChunks + 1;
            let rows: any[] = [];
            updateLoadProgress((prev) => ({
              ...prev,
              detail: `${metro}: netixlan chunk ${chunkIndex + 1} of ${ixChunks.length}`,
              progressCurrent,
              progressTotal: totalNetixlanChunks,
              throttleMessage: null,
            }));
            try {
              ({ data: rows } = await fetchPeeringDbWithRetry<any>(
                "netixlan",
                {
                  ix_id__in: param,
                  all: 1,
                },
                10,
                {
                  onThrottleWait: reportThrottleWait(
                    `${metro} netixlan chunk ${chunkIndex + 1} of ${ixChunks.length}`
                  ),
                }
              ));
            } catch (err: any) {
              throw new Error(`netixlan fetch failed for ${metro} ix_id__in=${param}: ${err?.message || err}`);
            }

            metroRows.push(...rows);
            completedNetixlanChunks += 1;
            await sleep(REQUEST_GAP_MS);
          }

          workingNetixlanCache[metro] = metroRows;
          updateLoadProgress((prev) => ({
            ...prev,
            detail: `Ready: IX capacity rows for ${metro}`,
            throttleMessage: null,
            metroStatuses: {
              ...prev.metroStatuses,
              [metro]: getMetroReadyStatus(metro),
            },
          }));
        }
      }

      // 2) Facility presence via per-metro cached netfac rows.
      const netfacPlans = metrosToLoad
        .filter((metro) => !hasMetroArrayCache(workingNetfacCache, metro))
        .map((metro) => ({
          metro,
          facIds: (workingFacCache[metro] || [])
            .map((fac) => fac.id)
            .filter((id: any) => typeof id === "number"),
        }));
      const totalNetfacChunks = netfacPlans.reduce((sum, plan) => {
        if (plan.facIds.length === 0) return sum;
        return sum + chunk(plan.facIds, FAC_CHUNK_SIZE).length;
      }, 0);
      updateLoadProgress((prev) => ({
        ...prev,
        step: 3,
        stageLabel: "Loading facility presence rows",
        detail:
          totalNetfacChunks === 0
            ? "Using cached facility presence rows for the selected metros"
            : `Fetching facility presence rows for ${netfacPlans.length} metro${netfacPlans.length === 1 ? "" : "s"}`,
        progressCurrent: 0,
        progressTotal: totalNetfacChunks,
        throttleMessage: null,
      }));
      if (totalNetfacChunks === 0) {
        metrosToLoad.forEach((metro) => {
          if (!hasMetroArrayCache(workingNetfacCache, metro)) {
            workingNetfacCache[metro] = [];
          }
        });
      } else {
        let completedNetfacChunks = 0;
        for (const plan of netfacPlans) {
          const { metro, facIds: metroFacIds } = plan;
          if (metroFacIds.length === 0) {
            workingNetfacCache[metro] = [];
            updateLoadProgress((prev) => ({
              ...prev,
              metroStatuses: {
                ...prev.metroStatuses,
                [metro]: getMetroReadyStatus(metro),
              },
            }));
            continue;
          }

          const metroRows: any[] = [];
          const facChunks = chunk(metroFacIds, FAC_CHUNK_SIZE);
          updateLoadProgress((prev) => ({
            ...prev,
            detail: `Loading facility presence rows for ${metro}`,
            throttleMessage: null,
            metroStatuses: {
              ...prev.metroStatuses,
              [metro]: "loading",
            },
          }));

          for (let chunkIndex = 0; chunkIndex < facChunks.length; chunkIndex += 1) {
            const ch = facChunks[chunkIndex];
            const param = ch.join(",");
            const progressCurrent = completedNetfacChunks + 1;
            let rows: any[] = [];
            updateLoadProgress((prev) => ({
              ...prev,
              detail: `${metro}: netfac chunk ${chunkIndex + 1} of ${facChunks.length}`,
              progressCurrent,
              progressTotal: totalNetfacChunks,
              throttleMessage: null,
            }));
            try {
              ({ data: rows } = await fetchPeeringDbWithRetry<any>(
                "netfac",
                {
                  fac_id__in: param,
                  all: 1,
                },
                10,
                {
                  onThrottleWait: reportThrottleWait(
                    `${metro} netfac chunk ${chunkIndex + 1} of ${facChunks.length}`
                  ),
                }
              ));
            } catch (err: any) {
              throw new Error(`netfac fetch failed for ${metro} fac_id__in=${param}: ${err?.message || err}`);
            }

            metroRows.push(...rows);
            completedNetfacChunks += 1;
            await sleep(REQUEST_GAP_MS);
          }

          workingNetfacCache[metro] = metroRows;
          updateLoadProgress((prev) => ({
            ...prev,
            detail: `Ready: facility presence rows for ${metro}`,
            throttleMessage: null,
            metroStatuses: {
              ...prev.metroStatuses,
              [metro]: getMetroReadyStatus(metro),
            },
          }));
        }
      }

      metrosToLoad.forEach((metro) => {
        (workingNetixlanCache[metro] || []).forEach((row: any) => {
          const netId = row.net_id;
          const asn = row.asn;
          const ixId = row.ix_id;
          if (!netId || !ixId) return;

          if (!netMap.has(netId)) {
            netMap.set(netId, {
              netId,
              asn,
              name: undefined,
              ixCaps: new Map<number, number>(),
              facIds: new Set<number>(),
            });
          }
          const entry = netMap.get(netId)!;
          if (asn && entry.asn == null) entry.asn = asn;

          const speed = typeof row.speed === "number" ? row.speed : 0;
          const prev = entry.ixCaps.get(ixId) ?? 0;
          entry.ixCaps.set(ixId, prev + (speed > 0 ? speed : 0));
        });

        (workingNetfacCache[metro] || []).forEach((row: any) => {
          const netId = row.net_id;
          const facId = row.fac_id;
          if (!netId || !facId) return;

          if (!netMap.has(netId)) {
            netMap.set(netId, {
              netId,
              asn: undefined,
              name: undefined,
              ixCaps: new Map<number, number>(),
              facIds: new Set<number>([facId]),
            });
          } else {
            netMap.get(netId)!.facIds.add(facId);
          }
        });
      });

      // 3) Enrich network names + ASN + origin metadata from /net and /org
      const netIds = Array.from(netMap.keys());
      const unknownNetIds = netIds.filter((netId) => workingNetDetailCache[netId] === undefined);
      const netIdChunks = chunk(unknownNetIds, NET_CHUNK_SIZE);
      const cachedOrgIdsFromKnownDetails = netIds
        .map((netId) => workingNetDetailCache[netId]?.orgId)
        .filter((orgId): orgId is number => typeof orgId === "number");
      const orgIdsToFetch = Array.from(new Set(cachedOrgIdsFromKnownDetails)).filter(
        (orgId) => workingNetworkOrgCache[orgId] === undefined
      );
      let orgIdChunks = chunk(orgIdsToFetch, ORG_CHUNK_SIZE);
      let completedDetailSteps = 0;
      updateLoadProgress((prev) => ({
        ...prev,
        step: 4,
        stageLabel: "Enriching network details and origins",
        detail:
          netIdChunks.length === 0 && orgIdChunks.length === 0
            ? `Using cached network details for ${netIds.length} networks`
            : `Fetching ${unknownNetIds.length} missing network records`,
        progressCurrent: 0,
        progressTotal: netIdChunks.length + orgIdChunks.length,
        throttleMessage: null,
      }));

      for (let chunkIndex = 0; chunkIndex < netIdChunks.length; chunkIndex += 1) {
        const idChunk = netIdChunks[chunkIndex];
        const param = idChunk.join(",");
        let nets: any[] = [];
        mergeLoadProgress({
          detail: `Network enrichment chunk ${chunkIndex + 1} of ${netIdChunks.length}`,
          progressCurrent: completedDetailSteps + 1,
          progressTotal: netIdChunks.length + orgIdChunks.length,
          throttleMessage: null,
        });
        try {
          ({ data: nets } = await fetchPeeringDbWithRetry<any>(
            "net",
            {
              id__in: param,
            },
            DETAIL_FETCH_ATTEMPTS,
            {
              onThrottleWait: reportThrottleWait(
                `network enrichment chunk ${chunkIndex + 1} of ${netIdChunks.length}`
              ),
            }
          ));
        } catch (err: any) {
          throw new Error(`net fetch failed for id__in=${param}: ${err?.message || err}`);
        }

        const returnedIds = new Set<number>();
        nets.forEach((netObj) => {
          const netId = netObj.id;
          if (!netId) return;
          returnedIds.add(netId);
          workingNetDetailCache[netId] = {
            asn: typeof netObj.asn === "number" ? netObj.asn : null,
            name: netObj.org || netObj.name || "",
            networkType: netObj.info_type || "",
            orgId: typeof netObj.org_id === "number" ? netObj.org_id : null,
            orgName: netObj.org || "",
            originCountry: "",
            originCity: "",
          };
        });
        idChunk.forEach((netId) => {
          if (!returnedIds.has(netId) && workingNetDetailCache[netId] === undefined) {
            workingNetDetailCache[netId] = {
              asn: null,
              name: "",
              networkType: "",
              orgId: null,
              orgName: "",
              originCountry: "",
              originCity: "",
            };
          }
        });
        completedDetailSteps += 1;
        await sleep(DETAIL_REQUEST_GAP_MS);
      }

      const allOrgIdsToFetch = Array.from(
        new Set(
          netIds
            .map((netId) => workingNetDetailCache[netId]?.orgId)
            .filter((orgId): orgId is number => typeof orgId === "number")
        )
      ).filter((orgId) => workingNetworkOrgCache[orgId] === undefined);
      orgIdChunks = chunk(allOrgIdsToFetch, ORG_CHUNK_SIZE);

      for (let chunkIndex = 0; chunkIndex < orgIdChunks.length; chunkIndex += 1) {
        const idChunk = orgIdChunks[chunkIndex];
        const param = idChunk.join(",");
        let orgs: any[] = [];
        mergeLoadProgress({
          detail: `Origin enrichment chunk ${chunkIndex + 1} of ${orgIdChunks.length}`,
          progressCurrent: completedDetailSteps + 1,
          progressTotal: netIdChunks.length + orgIdChunks.length,
          throttleMessage: null,
        });
        try {
          ({ data: orgs } = await fetchPeeringDbWithRetry<any>(
            "org",
            { id__in: param },
            DETAIL_FETCH_ATTEMPTS,
            {
              onThrottleWait: reportThrottleWait(
                `origin enrichment chunk ${chunkIndex + 1} of ${orgIdChunks.length}`
              ),
            }
          ));
        } catch (err: any) {
          throw new Error(`org fetch failed for id__in=${param}: ${err?.message || err}`);
        }

        idChunk.forEach((orgId) => {
          if (workingNetworkOrgCache[orgId] === undefined) {
            workingNetworkOrgCache[orgId] = { name: "", country: "", city: "" };
          }
        });

        orgs.forEach((orgObj) => {
          const orgId = orgObj.id;
          if (!orgId) return;
          workingNetworkOrgCache[orgId] = {
            name: orgObj.name || "",
            country: orgObj.country || "",
            city: orgObj.city || "",
          };
        });

        completedDetailSteps += 1;
        await sleep(DETAIL_REQUEST_GAP_MS);
      }

      netMap.forEach((entry, netId) => {
        const cachedDetail = workingNetDetailCache[netId];
        if (!cachedDetail) return;
        if (typeof cachedDetail.asn === "number") {
          entry.asn = cachedDetail.asn;
        }
        if (cachedDetail.name) {
          entry.name = cachedDetail.name;
        }
        if (cachedDetail.networkType) {
          entry.networkType = cachedDetail.networkType;
        }
        if (typeof cachedDetail.orgId === "number") {
          entry.orgId = cachedDetail.orgId;
        }
        if (cachedDetail.orgName) {
          entry.orgName = cachedDetail.orgName;
        }
        const orgDetail =
          typeof cachedDetail.orgId === "number" ? workingNetworkOrgCache[cachedDetail.orgId] : undefined;
        if (orgDetail) {
          if (orgDetail.name && !entry.orgName) entry.orgName = orgDetail.name;
          if (orgDetail.country) entry.originCountry = orgDetail.country;
          if (orgDetail.city) entry.originCity = orgDetail.city;
        }
      });

      const networks = Array.from(netMap.values())
        .filter((n) => typeof n.asn === "number")
        .sort((a, b) => {
          const aAsn = a.asn ?? Number.MAX_SAFE_INTEGER;
          const bAsn = b.asn ?? Number.MAX_SAFE_INTEGER;
          return aAsn - bAsn;
        });

      setLoadProgress((prev) =>
        prev
          ? {
              ...prev,
              step: 5,
              stageLabel: "Building matrices and compare view",
              detail: `Loaded ${networks.length} networks across ${metrosToLoad.length} metros`,
              progressCurrent: 1,
              progressTotal: 1,
              throttleMessage: null,
              metroStatuses: metrosToLoad.reduce((acc, metro) => {
                acc[metro] = "ready";
                return acc;
              }, {} as Partial<Record<MetroKey, MetroLoadStatus>>),
            }
          : prev
      );

      // Commit cache and network data; mark last-loaded metros + timestamp.
      setIxCache(workingIxCache);
      setFacCache(workingFacCache);
      setNetixlanCache(workingNetixlanCache);
      setNetfacCache(workingNetfacCache);
      setNetDetailCache(workingNetDetailCache);
      setNetworkOrgCache(workingNetworkOrgCache);
      setMetroNetworks(networks);
      setLastLoadedMetros(metrosToLoad);
      setLastLoadedAt(new Date());
    } catch (e: any) {
      console.error(e);
      setIxCache(workingIxCache);
      setFacCache(workingFacCache);
      setNetixlanCache(workingNetixlanCache);
      setNetfacCache(workingNetfacCache);
      setNetDetailCache(workingNetDetailCache);
      setNetworkOrgCache(workingNetworkOrgCache);
      setLoadProgress((prev) =>
        prev
          ? {
              ...prev,
              stageLabel: "Load failed",
              detail: e?.message || "Error loading networks for metros.",
            }
          : prev
      );
      setAllNetError(e?.message || "Error loading networks for metros.");
    } finally {
      setAllNetLoading(false);
    }
  };

  // ---- filters ----
  const asnFilterSet = (() => {
    const raw = asnFilterText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const nums = raw.map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
    return new Set(nums);
  })();

  const nameTokens = nameFilterText
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const filteredNetworks = metroNetworks.filter((net) => {
    if (!net.asn) return false;

    if (asnFilterSet.size > 0 && !asnFilterSet.has(net.asn)) return false;

    if (nameTokens.length > 0) {
      const label = (net.name ?? "").toLowerCase();
      const match = nameTokens.some((tok) => label.includes(tok));
      if (!match) return false;
    }

    return true;
  });

  // ---- IX counts and capacity totals (for selected networks) ----
  const ixCounts = new Map<number, number>();
  filteredNetworks.forEach((net) => {
    net.ixCaps.forEach((_cap, ixId) => {
      const prev = ixCounts.get(ixId) ?? 0;
      ixCounts.set(ixId, prev + 1);
    });
  });

  const ixSelectedSet = new Set(selectedIxIds);
  const ixCapacityTotals = new Map<number, number>();
  filteredNetworks.forEach((net) => {
    net.ixCaps.forEach((cap, ixId) => {
      if (ixSelectedSet.size > 0 && !ixSelectedSet.has(ixId)) return;
      const prev = ixCapacityTotals.get(ixId) ?? 0;
      ixCapacityTotals.set(ixId, prev + cap);
    });
  });

  // IX columns – Equinix first, then by #nets.
  const ixColumnsSorted = [...ixData]
    .filter((ix) => typeof ix.id === "number")
    .sort((a, b) => {
      const aName = (a.name || "").toLowerCase();
      const bName = (b.name || "").toLowerCase();
      const aEq = aName.includes("equinix");
      const bEq = bName.includes("equinix");
      if (aEq && !bEq) return -1;
      if (!aEq && bEq) return 1;
      const aCount = ixCounts.get(a.id) ?? 0;
      const bCount = ixCounts.get(b.id) ?? 0;
      return bCount - aCount;
    })
    .filter((ix) => ixSelectedSet.size === 0 || ixSelectedSet.has(ix.id));

  // consistent colours for stacked chart – Equinix always red.
  const ixColors = React.useMemo(() => {
    const palette = [
      "#22c55e",
      "#3b82f6",
      "#a855f7",
      "#f97316",
      "#eab308",
      "#0ea5e9",
      "#10b981",
      "#facc15",
      "#6366f1",
      "#f472b6",
    ];
    const map: Record<number, string> = {};
    let colorIndex = 0;

    ixColumnsSorted.forEach((ix) => {
      const name = (ix.name || "").toLowerCase();
      if (name.includes("equinix")) {
        map[ix.id] = "#ef4444";
      } else {
        map[ix.id] = palette[colorIndex % palette.length];
        colorIndex += 1;
      }
    });

    return map;
  }, [ixColumnsSorted]);

  // ---- facility network counts & org grouping ----
  const facNetworkCounts = new Map<number, number>();
  filteredNetworks.forEach((net) => {
    net.facIds.forEach((fid) => {
      const prev = facNetworkCounts.get(fid) ?? 0;
      facNetworkCounts.set(fid, prev + 1);
    });
  });

  const facSelectedSet = new Set(selectedFacIds);

  const orgMap = new Map<
    string,
    { org: string; facilities: { fac: any; networkCount: number }[]; totalNetworks: number }
  >();

  facData.forEach((fac) => {
    if (facSelectedSet.size > 0 && !facSelectedSet.has(fac.id)) return;

    let orgName: string;
    const orgRec = fac.org_id && orgLookup[fac.org_id];
    if (orgRec && orgRec.name) {
      orgName = String(orgRec.name);
    } else {
      orgName = classifyOrgFallback(fac.name);
    }

    const count = facNetworkCounts.get(fac.id) ?? 0;
    if (!orgMap.has(orgName)) {
      orgMap.set(orgName, { org: orgName, facilities: [], totalNetworks: 0 });
    }
    const g = orgMap.get(orgName)!;
    g.facilities.push({ fac, networkCount: count });
    g.totalNetworks += count;
  });

  const orgGroups = Array.from(orgMap.values()).map((g) => {
    g.facilities.sort((a, b) => b.networkCount - a.networkCount);
    return g;
  });

  // Equinix org first, then by total networks.
  orgGroups.sort((a, b) => {
    const aLower = a.org.toLowerCase();
    const bLower = b.org.toLowerCase();
    const aIsEquinix = aLower.includes("equinix");
    const bIsEquinix = bLower.includes("equinix");
    if (aIsEquinix && !bIsEquinix) return -1;
    if (!aIsEquinix && bIsEquinix) return 1;
    return b.totalNetworks - a.totalNetworks;
  });

  const facColumnsFlat = orgGroups.flatMap((g) => g.facilities.map((f) => f.fac));

  // ---- sorting ----
  const sortedNetworks: MetroNetwork[] = React.useMemo(() => {
    const arr = [...filteredNetworks];
    const dir = sortState.direction === "asc" ? 1 : -1;

    arr.sort((a, b) => {
      if (sortState.key === "asn") {
        const aAsn = a.asn ?? Number.MAX_SAFE_INTEGER;
        const bAsn = b.asn ?? Number.MAX_SAFE_INTEGER;
        return (aAsn - bAsn) * dir;
      }

      if (sortState.key === "name") {
        const aName = (a.name ?? "").toLowerCase();
        const bName = (b.name ?? "").toLowerCase();
        if (aName === bName) {
          const aAsn = a.asn ?? Number.MAX_SAFE_INTEGER;
          const bAsn = b.asn ?? Number.MAX_SAFE_INTEGER;
          return (aAsn - bAsn) * dir;
        }
        return (aName < bName ? -1 : 1) * dir;
      }

      if (sortState.key === "ix" && sortState.ixId != null) {
        const ixId = sortState.ixId;
        const aCap = a.ixCaps.get(ixId) ?? 0;
        const bCap = b.ixCaps.get(ixId) ?? 0;
        if (aCap === bCap) {
          const aAsn = a.asn ?? Number.MAX_SAFE_INTEGER;
          const bAsn = b.asn ?? Number.MAX_SAFE_INTEGER;
          return (aAsn - bAsn) * dir;
        }
        return (aCap - bCap) * dir;
      }

      const aAsn = a.asn ?? Number.MAX_SAFE_INTEGER;
      const bAsn = b.asn ?? Number.MAX_SAFE_INTEGER;
      return (aAsn - bAsn) * dir;
    });

    return arr;
  }, [filteredNetworks, sortState]);

  const toggleDir = (d: "asc" | "desc") => (d === "asc" ? "desc" : "asc");

  const sortByAsn = () => {
    setSortState((prev) =>
      prev.key === "asn" ? { key: "asn", direction: toggleDir(prev.direction) } : { key: "asn", direction: "asc" }
    );
  };

  const sortByName = () => {
    setSortState((prev) =>
      prev.key === "name" ? { key: "name", direction: toggleDir(prev.direction) } : { key: "name", direction: "asc" }
    );
  };

  const sortByIx = (ixId: number) => {
    setSortState((prev) =>
      prev.key === "ix" && prev.ixId === ixId
        ? { key: "ix", ixId, direction: toggleDir(prev.direction) }
        : { key: "ix", ixId, direction: "desc" }
    );
  };

  const sortIndicator = (key: SortKey, ixId?: number) => {
    if (sortState.key !== key) return "";
    if (key === "ix" && sortState.ixId !== ixId) return "";
    return sortState.direction === "asc" ? " ▲" : " ▼";
  };

  // ---- stacked capacity stats ----
  const capacityStats = React.useMemo(() => {
    if (ixColumnsSorted.length === 0) {
      return { rows: [] as CapacityRow[], grandTotalGbps: 0, maxTotalGbps: 0 };
    }

    const rows: CapacityRow[] = [];

    sortedNetworks.forEach((net) => {
      let totalGbps = 0;
      const segments: CapacitySegment[] = [];

      ixColumnsSorted.forEach((ix) => {
        const capGbps = (net.ixCaps.get(ix.id) ?? 0) / 1000;
        if (capGbps > 0) {
          segments.push({ ixId: ix.id, ixName: ix.name, gbps: capGbps });
          totalGbps += capGbps;
        }
      });

      if (totalGbps > 0) {
        rows.push({ net, segments, totalGbps });
      }
    });

    const grandTotalGbps = rows.reduce((sum, r) => sum + r.totalGbps, 0);
    const maxTotalGbps = rows.reduce((m, r) => Math.max(m, r.totalGbps), 0);

    rows.sort((a, b) => b.totalGbps - a.totalGbps);

    return { rows, grandTotalGbps, maxTotalGbps };
  }, [sortedNetworks, ixColumnsSorted]);

  // ---- per-metro compare summaries for loaded data ----
  const metroCompareSummaries = React.useMemo(() => {
    const summaries: {
      key: MetroKey;
      totalGbps: number;
      ixActiveNetworks: number;
      ixCount: number;
      facilityPresenceCount: number;
      facilityNetworkCount: number;
      facilityCount: number;
    }[] = [];

    if (metroNetworks.length === 0 || lastLoadedMetros.length === 0) return summaries;

    lastLoadedMetros.forEach((mKey) => {
      const metroIxIds = new Set(
        (ixCache[mKey] || [])
          .map((ix) => ix?.id)
          .filter((id: any) => typeof id === "number")
      );
      const metroFacIds = new Set(
        (facCache[mKey] || [])
          .map((fac) => fac?.id)
          .filter((id: any) => typeof id === "number")
      );

      let totalGbps = 0;
      let ixActiveNetworks = 0;
      let facilityPresenceCount = 0;
      let facilityNetworkCount = 0;

      metroNetworks.forEach((net) => {
        let hasIxCapacity = false;
        net.ixCaps.forEach((cap, ixId) => {
          if (metroIxIds.has(ixId) && cap > 0) {
            totalGbps += cap / 1000;
            hasIxCapacity = true;
          }
        });
        if (hasIxCapacity) {
          ixActiveNetworks += 1;
        }

        let presenceForNetwork = 0;
        net.facIds.forEach((facId) => {
          if (metroFacIds.has(facId)) {
            presenceForNetwork += 1;
          }
        });
        facilityPresenceCount += presenceForNetwork;
        if (presenceForNetwork > 0) {
          facilityNetworkCount += 1;
        }
      });

      summaries.push({
        key: mKey,
        totalGbps,
        ixActiveNetworks,
        ixCount: metroIxIds.size,
        facilityPresenceCount,
        facilityNetworkCount,
        facilityCount: metroFacIds.size,
      });
    });

    return summaries;
  }, [metroNetworks, lastLoadedMetros, ixCache, facCache]);

  const metroSummaries = React.useMemo(
    () =>
      metroCompareSummaries.map((summary) => ({
        key: summary.key,
        totalGbps: summary.totalGbps,
        uniqueNets: summary.ixActiveNetworks,
      })),
    [metroCompareSummaries]
  );

  const maxMetroCapacityGbps = React.useMemo(
    () => metroCompareSummaries.reduce((max, summary) => Math.max(max, summary.totalGbps), 0),
    [metroCompareSummaries]
  );

  const maxMetroFacilityPresence = React.useMemo(
    () =>
      metroCompareSummaries.reduce(
        (max, summary) => Math.max(max, summary.facilityPresenceCount),
        0
      ),
    [metroCompareSummaries]
  );

  const metroCapacityStacks = React.useMemo(() => {
    return lastLoadedMetros.map((metro) => {
      const metroIxIds = new Set(
        (ixCache[metro] || [])
          .map((ix) => ix?.id)
          .filter((id: any) => typeof id === "number")
      );

      const ixEntries = ixColumnsSorted
        .filter((ix) => metroIxIds.has(ix.id))
        .map((ix) => {
          let capacityGbps = 0;
          filteredNetworks.forEach((net) => {
            capacityGbps += (net.ixCaps.get(ix.id) ?? 0) / 1000;
          });
          return {
            ixId: ix.id,
            ixName: ix.name || `IX ${ix.id}`,
            capacityGbps,
          };
        })
        .filter((entry) => entry.capacityGbps > 0)
        .sort((a, b) => b.capacityGbps - a.capacityGbps);

      const totalGbps = ixEntries.reduce((sum, entry) => sum + entry.capacityGbps, 0);
      return { metro, ixEntries, totalGbps };
    });
  }, [lastLoadedMetros, ixCache, ixColumnsSorted, filteredNetworks]);

  const rawPresenceGapRows = React.useMemo(() => {
    if (sortedNetworks.length === 0 || lastLoadedMetros.length === 0) return [] as PresenceGapRow[];

    const rows = sortedNetworks.map((net) => {
      const metroStates = {} as Record<MetroKey, MetroPresenceSummary>;
      let presentMetroCount = 0;
      const metroFootprint: string[] = [];

      lastLoadedMetros.forEach((mKey) => {
        const metroIxIds = new Set(
          (ixCache[mKey] || [])
            .map((ix) => ix?.id)
            .filter((id: any) => typeof id === "number")
        );
        const metroFacIds = new Set(
          (facCache[mKey] || [])
            .map((fac) => fac?.id)
            .filter((id: any) => typeof id === "number")
        );

        let capacityGbps = 0;
        net.ixCaps.forEach((cap, ixId) => {
          if (metroIxIds.has(ixId) && cap > 0) {
            capacityGbps += cap / 1000;
          }
        });

        let facilityPresenceCount = 0;
        net.facIds.forEach((facId) => {
          if (metroFacIds.has(facId)) {
            facilityPresenceCount += 1;
          }
        });

        const ixPresent = capacityGbps > 0;
        const facilityPresent = facilityPresenceCount > 0;
        metroStates[mKey] = {
          ixPresent,
          facilityPresent,
          capacityGbps,
          facilityPresenceCount,
        };

        if (ixPresent || facilityPresent) {
          presentMetroCount += 1;
          if (ixPresent && facilityPresent) metroFootprint.push(`${mKey} (Both)`);
          else if (ixPresent) metroFootprint.push(`${mKey} (IX only)`);
          else metroFootprint.push(`${mKey} (Facility only)`);
        }
      });

      return {
        net,
        metroStates,
        presentMetroCount,
        metroFootprint,
      };
    });

    return rows;

  }, [
    sortedNetworks,
    lastLoadedMetros,
    ixCache,
    facCache,
  ]);

  const gapNetworkTokens = React.useMemo(
    () =>
      gapNetworkFilterText
        .split(/[\s,]+/)
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean),
    [gapNetworkFilterText]
  );

  const presenceGapRows = React.useMemo(() => {
    const filteredRows = rawPresenceGapRows.filter((row) => {
      if (gapFilterMode === "missing_somewhere") {
        if (!(row.presentMetroCount > 0 && row.presentMetroCount < lastLoadedMetros.length)) return false;
      } else if (gapFilterMode === "present_in_all") {
        if (!(lastLoadedMetros.length > 0 && row.presentMetroCount === lastLoadedMetros.length)) return false;
      } else if (gapFilterMode === "only_one_metro") {
        if (row.presentMetroCount !== 1) return false;
      } else if (gapFilterMode === "present_in_source_not_target") {
        const sourcePresent =
          gapSourceMetros.length > 0 &&
          gapSourceMetros.every((metro) => {
            const summary = row.metroStates[metro];
            return Boolean(summary?.ixPresent || summary?.facilityPresent);
          });
        const targetPresent =
          gapTargetMetros.length > 0 &&
          gapTargetMetros.some((metro) => {
            const summary = row.metroStates[metro];
            return Boolean(summary?.ixPresent || summary?.facilityPresent);
          });
        if (!Boolean(sourcePresent && !targetPresent)) return false;
      }

      if (gapNetworkTokens.length > 0) {
        const haystack = `${row.net.asn ?? ""} ${(row.net.name ?? "").toLowerCase()}`;
        if (!gapNetworkTokens.some((token) => haystack.includes(token))) {
          return false;
        }
      }

      return true;
    });

    const direction = gapSortDirection === "asc" ? 1 : -1;
    filteredRows.sort((a, b) => {
      if (gapSortField === "asn") {
        const aAsn = a.net.asn ?? Number.MAX_SAFE_INTEGER;
        const bAsn = b.net.asn ?? Number.MAX_SAFE_INTEGER;
        return (aAsn - bAsn) * direction;
      }

      if (gapSortField === "name") {
        const aName = (a.net.name ?? "").toLowerCase();
        const bName = (b.net.name ?? "").toLowerCase();
        if (aName !== bName) return (aName < bName ? -1 : 1) * direction;
      }

      if (gapSortField === "present_count") {
        if (a.presentMetroCount !== b.presentMetroCount) {
          return (a.presentMetroCount - b.presentMetroCount) * direction;
        }
      }

      if (gapSortField === "source_capacity") {
        const aCapacity = gapSourceMetros.reduce(
          (sum, metro) => sum + (a.metroStates[metro]?.capacityGbps ?? 0),
          0
        );
        const bCapacity = gapSourceMetros.reduce(
          (sum, metro) => sum + (b.metroStates[metro]?.capacityGbps ?? 0),
          0
        );
        if (aCapacity !== bCapacity) {
          return (aCapacity - bCapacity) * direction;
        }
      }

      if (gapSortField === "source_facility_presence") {
        const aPresence = gapSourceMetros.reduce(
          (sum, metro) => sum + (a.metroStates[metro]?.facilityPresenceCount ?? 0),
          0
        );
        const bPresence = gapSourceMetros.reduce(
          (sum, metro) => sum + (b.metroStates[metro]?.facilityPresenceCount ?? 0),
          0
        );
        if (aPresence !== bPresence) {
          return (aPresence - bPresence) * direction;
        }
      }

      const aAsn = a.net.asn ?? Number.MAX_SAFE_INTEGER;
      const bAsn = b.net.asn ?? Number.MAX_SAFE_INTEGER;
      return (aAsn - bAsn) * direction;
    });

    return filteredRows;
  }, [
    gapFilterMode,
    gapSourceMetros,
    gapTargetMetros,
    gapNetworkTokens,
    gapSortDirection,
    gapSortField,
    lastLoadedMetros.length,
    rawPresenceGapRows,
  ]);

  useEffect(() => {
    if (presenceGapRows.length === 0) {
      setSelectedGapNetId(null);
      return;
    }
    setSelectedGapNetId((prev) => {
      if (prev != null && presenceGapRows.some((row) => row.net.netId === prev)) {
        return prev;
      }
      return presenceGapRows[0]?.net.netId ?? null;
    });
  }, [presenceGapRows]);

  const selectedGapRow = React.useMemo(
    () => presenceGapRows.find((row) => row.net.netId === selectedGapNetId) || null,
    [presenceGapRows, selectedGapNetId]
  );

  const selectedGapMetroDetails = React.useMemo(() => {
    if (!selectedGapRow) return [] as Array<{
      metro: MetroKey;
      summary: MetroPresenceSummary;
      ixEntries: Array<{ id: number; name: string; capacityGbps: number }>;
      facilityEntries: Array<{ id: number; name: string; city: string }>;
    }>;

    return lastLoadedMetros.map((metro) => {
      const net = selectedGapRow.net;
      const summary = selectedGapRow.metroStates[metro];
      const ixEntries = (ixCache[metro] || [])
        .filter((ix) => typeof ix?.id === "number" && (net.ixCaps.get(ix.id) ?? 0) > 0)
        .map((ix) => ({
          id: ix.id,
          name: ix.name || `IX ${ix.id}`,
          capacityGbps: (net.ixCaps.get(ix.id) ?? 0) / 1000,
        }))
        .sort((a, b) => b.capacityGbps - a.capacityGbps);

      const facilityEntries = (facCache[metro] || [])
        .filter((fac) => typeof fac?.id === "number" && net.facIds.has(fac.id))
        .map((fac) => ({
          id: fac.id,
          name: fac.name || `Facility ${fac.id}`,
          city: fac.city || "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        metro,
        summary,
        ixEntries,
        facilityEntries,
      };
    });
  }, [selectedGapRow, lastLoadedMetros, ixCache, facCache]);

  const selectedGapIxLegend = React.useMemo(() => {
    const seen = new Map<number, string>();
    selectedGapMetroDetails.forEach(({ ixEntries }) => {
      ixEntries.forEach((ix) => {
        if (!seen.has(ix.id)) {
          seen.set(ix.id, ix.name);
        }
      });
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [selectedGapMetroDetails]);

  const selectedGapMaxMetroCapacity = React.useMemo(
    () =>
      selectedGapMetroDetails.reduce(
        (max, detail) => Math.max(max, detail.summary?.capacityGbps ?? 0),
        0
      ),
    [selectedGapMetroDetails]
  );

  const buildMetroDetailForNetwork = React.useCallback((net: MetroNetwork, metro: MetroKey) => {
    const ixEntries = (ixCache[metro] || [])
      .filter((ix: any) => (net.ixCaps.get(ix.id) ?? 0) > 0)
      .map((ix: any) => ({
        id: ix.id,
        name: ix.name,
        capacityGbps: (net.ixCaps.get(ix.id) ?? 0) / 1000,
      }))
      .sort((a, b) => b.capacityGbps - a.capacityGbps);

    const facilityEntries = (facCache[metro] || [])
      .filter((fac: any) => net.facIds.has(fac.id))
      .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")));

    return {
      ixEntries,
      facilityEntries,
      totalGbps: ixEntries.reduce((sum, entry) => sum + entry.capacityGbps, 0),
    };
  }, [facCache, ixCache]);

  const describePresenceReason = (net: MetroNetwork, metro: MetroKey, summary?: MetroPresenceSummary) => {
    const detail = buildMetroDetailForNetwork(net, metro);
    if (!summary || (!summary.ixPresent && !summary.facilityPresent)) {
      return {
        title: `${metro}: absent`,
        lines: ["No IX deployment or facility presence found in this metro."],
      };
    }

    const ixLine =
      detail.ixEntries.length > 0
        ? `IX deployment at ${formatCapacity(detail.totalGbps)} across ${formatCount(detail.ixEntries.length)} IXs`
        : "No IX deployment";
    const facLine =
      detail.facilityEntries.length > 0
        ? `Facility presence in ${formatCount(detail.facilityEntries.length)} DCs`
        : "No facility presence";

    return {
      title: `${metro}: ${presenceStatusLabel(summary)}`,
      lines: [ixLine, facLine],
      detail,
    };
  };

  const presenceStatusLabel = (summary?: MetroPresenceSummary) => {
    if (!summary) return "Absent";
    if (summary.ixPresent && summary.facilityPresent) return "Both";
    if (summary.ixPresent) return "IX only";
    if (summary.facilityPresent) return "Facility only";
    return "Absent";
  };

  const presenceTone = (summary?: MetroPresenceSummary) => {
    if (!summary || (!summary.ixPresent && !summary.facilityPresent)) {
      return {
        background: theme.absentBg,
        color: theme.absentFg,
        borderColor: theme.gridBorder,
      };
    }
    if (summary.ixPresent && summary.facilityPresent) {
      return {
        background: theme.bothBg,
        color: theme.bothFg,
        borderColor: theme.successAccent,
      };
    }
    if (summary.ixPresent) {
      return {
        background: theme.ixOnlyBg,
        color: theme.ixOnlyFg,
        borderColor: theme.capacityAccent,
      };
    }
    return {
      background: theme.facilityOnlyBg,
      color: theme.facilityOnlyFg,
      borderColor: theme.facilityAccent,
    };
  };

  const metricChipStyle = (kind: "capacity" | "facility"): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 9999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.1,
    border: `1px solid ${kind === "capacity" ? theme.capacityAccent : theme.facilityAccent}`,
    background: kind === "capacity" ? theme.capacityBadgeBg : theme.facilityBadgeBg,
    color: kind === "capacity" ? theme.capacityAccentSoft : theme.facilityAccentSoft,
  });

  const metroSummaryInsightRows = React.useMemo<InsightRecord[]>(
    () =>
      metroCompareSummaries.map((summary) => ({
        row_id: `metro:${summary.key}`,
        metro: summary.key,
        region: METROS[summary.key].region,
        deployed_capacity_gbps: Number(summary.totalGbps.toFixed(3)),
        unique_networks: summary.ixActiveNetworks,
        facility_presences: summary.facilityPresenceCount,
        ix_count: summary.ixCount,
        facility_count: summary.facilityCount,
        record_count: 1,
      })),
    [metroCompareSummaries]
  );

  const networkMetroInsightRows = React.useMemo<InsightRecord[]>(() => {
    const rows: InsightRecord[] = [];

    rawPresenceGapRows.forEach((row) => {
      lastLoadedMetros.forEach((metro) => {
        const summary = row.metroStates[metro];
        if (!summary || (!summary.ixPresent && !summary.facilityPresent)) return;
        const detail = buildMetroDetailForNetwork(row.net, metro);
        rows.push({
          row_id: `network-metro:${row.net.netId}:${metro}`,
          metro,
          region: METROS[metro].region,
          network_name: row.net.name || `AS${row.net.asn ?? row.net.netId}`,
          asn: row.net.asn ?? 0,
          network_type: row.net.networkType || "Unknown",
          origin_country: row.net.originCountry || "Unknown",
          origin_city: row.net.originCity || "Unknown",
          presence_type: presenceStatusLabel(summary),
          deployed_capacity_gbps: Number(summary.capacityGbps.toFixed(3)),
          facility_presences: summary.facilityPresenceCount,
          ix_count: detail.ixEntries.length,
          facility_count: detail.facilityEntries.length,
          record_count: 1,
        });
      });
    });

    return rows;
  }, [buildMetroDetailForNetwork, lastLoadedMetros, rawPresenceGapRows]);

  const ixDeploymentInsightRows = React.useMemo<InsightRecord[]>(() => {
    const rows: InsightRecord[] = [];

    rawPresenceGapRows.forEach((row) => {
      lastLoadedMetros.forEach((metro) => {
        const detail = buildMetroDetailForNetwork(row.net, metro);
        detail.ixEntries.forEach((ix) => {
          rows.push({
            row_id: `ix:${metro}:${row.net.netId}:${ix.id}`,
            metro,
            region: METROS[metro].region,
            ix: ix.name || `IX ${ix.id}`,
            network_name: row.net.name || `AS${row.net.asn ?? row.net.netId}`,
            asn: row.net.asn ?? 0,
            network_type: row.net.networkType || "Unknown",
            origin_country: row.net.originCountry || "Unknown",
            origin_city: row.net.originCity || "Unknown",
            deployed_capacity_gbps: Number(ix.capacityGbps.toFixed(3)),
            record_count: 1,
          });
        });
      });
    });

    return rows;
  }, [buildMetroDetailForNetwork, lastLoadedMetros, rawPresenceGapRows]);

  const facilityPresenceInsightRows = React.useMemo<InsightRecord[]>(() => {
    const rows: InsightRecord[] = [];

    rawPresenceGapRows.forEach((row) => {
      lastLoadedMetros.forEach((metro) => {
        const facilities = (facCache[metro] || [])
          .filter((fac: any) => typeof fac?.id === "number" && row.net.facIds.has(fac.id))
          .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")));

        facilities.forEach((fac: any) => {
          const orgName =
            fac.org_id && orgLookup[fac.org_id]?.name
              ? String(orgLookup[fac.org_id].name)
              : classifyOrgFallback(fac.name);

          rows.push({
            row_id: `facility:${metro}:${row.net.netId}:${fac.id}`,
            metro,
            region: METROS[metro].region,
            facility: fac.name || `Facility ${fac.id}`,
            facility_city: fac.city || "",
            facility_operator: orgName,
            network_name: row.net.name || `AS${row.net.asn ?? row.net.netId}`,
            asn: row.net.asn ?? 0,
            network_type: row.net.networkType || "Unknown",
            origin_country: row.net.originCountry || "Unknown",
            origin_city: row.net.originCity || "Unknown",
            facility_presences: 1,
            record_count: 1,
          });
        });
      });
    });

    return rows;
  }, [facCache, lastLoadedMetros, orgLookup, rawPresenceGapRows]);

  const insightDatasets = React.useMemo<Record<InsightsDataset, InsightDatasetDefinition>>(
    () => ({
      metro_summary: {
        key: "metro_summary",
        label: "Metro summary",
        description: "One row per loaded metro. Best for macro comparisons of capacity, network footprint, and facility intensity.",
        rows: metroSummaryInsightRows,
        dimensions: [
          { key: "metro", label: "Metro" },
          { key: "region", label: "Region" },
        ],
        metrics: [
          { key: "deployed_capacity_gbps", label: "Deployed capacity", format: "capacity" },
          { key: "unique_networks", label: "Unique networks", format: "count" },
          { key: "facility_presences", label: "Facility/DC presences", format: "count" },
          { key: "ix_count", label: "IX count", format: "count" },
          { key: "facility_count", label: "Facility count", format: "count" },
        ],
        seriesOptions: [{ key: "region", label: "Region" }],
        tableFields: [
          { key: "metro", label: "Metro" },
          { key: "region", label: "Region" },
          { key: "deployed_capacity_gbps", label: "Deployed capacity (Gbps)" },
          { key: "unique_networks", label: "Unique networks" },
          { key: "facility_presences", label: "Facility/DC presences" },
          { key: "ix_count", label: "IX count" },
          { key: "facility_count", label: "Facility count" },
        ],
        defaultCategory: "metro",
        defaultMetric: "deployed_capacity_gbps",
        defaultSeries: "region",
        defaultChart: "bar",
      },
      network_metro: {
        key: "network_metro",
        label: "Network by metro",
        description: "One row per network per metro where it has IX deployment or facility presence. Great for top networks and origin/type analysis.",
        rows: networkMetroInsightRows,
        dimensions: [
          { key: "metro", label: "Metro" },
          { key: "region", label: "Region" },
          { key: "network_name", label: "Network name" },
          { key: "asn", label: "ASN" },
          { key: "network_type", label: "Network type" },
          { key: "origin_country", label: "Origin country" },
          { key: "origin_city", label: "Origin city" },
          { key: "presence_type", label: "Presence type" },
        ],
        metrics: [
          { key: "deployed_capacity_gbps", label: "Deployed capacity", format: "capacity" },
          { key: "facility_presences", label: "Facility/DC presences", format: "count" },
          { key: "ix_count", label: "IX count", format: "count" },
          { key: "facility_count", label: "Facility count", format: "count" },
          { key: "record_count", label: "Network-metro rows", format: "count" },
        ],
        seriesOptions: [
          { key: "metro", label: "Metro" },
          { key: "region", label: "Region" },
          { key: "network_type", label: "Network type" },
          { key: "origin_country", label: "Origin country" },
          { key: "presence_type", label: "Presence type" },
        ],
        tableFields: [
          { key: "metro", label: "Metro" },
          { key: "network_name", label: "Network name" },
          { key: "asn", label: "ASN" },
          { key: "network_type", label: "Network type" },
          { key: "origin_country", label: "Origin country" },
          { key: "origin_city", label: "Origin city" },
          { key: "presence_type", label: "Presence type" },
          { key: "deployed_capacity_gbps", label: "Deployed capacity (Gbps)" },
          { key: "facility_presences", label: "Facility/DC presences" },
          { key: "ix_count", label: "IX count" },
          { key: "facility_count", label: "Facility count" },
        ],
        defaultCategory: "network_name",
        defaultMetric: "deployed_capacity_gbps",
        defaultSeries: "metro",
        defaultChart: "bar",
      },
      ix_deployment: {
        key: "ix_deployment",
        label: "IX deployment",
        description: "One row per network per IX per metro. Best for drilling into deployed capacity across IXs and comparing IX footprints.",
        rows: ixDeploymentInsightRows,
        dimensions: [
          { key: "metro", label: "Metro" },
          { key: "region", label: "Region" },
          { key: "ix", label: "IX" },
          { key: "network_name", label: "Network name" },
          { key: "asn", label: "ASN" },
          { key: "network_type", label: "Network type" },
          { key: "origin_country", label: "Origin country" },
          { key: "origin_city", label: "Origin city" },
        ],
        metrics: [
          { key: "deployed_capacity_gbps", label: "Deployed capacity", format: "capacity" },
          { key: "record_count", label: "IX deployments", format: "count" },
        ],
        seriesOptions: [
          { key: "metro", label: "Metro" },
          { key: "region", label: "Region" },
          { key: "ix", label: "IX" },
          { key: "network_type", label: "Network type" },
          { key: "origin_country", label: "Origin country" },
        ],
        tableFields: [
          { key: "metro", label: "Metro" },
          { key: "ix", label: "IX" },
          { key: "network_name", label: "Network name" },
          { key: "asn", label: "ASN" },
          { key: "network_type", label: "Network type" },
          { key: "origin_country", label: "Origin country" },
          { key: "origin_city", label: "Origin city" },
          { key: "deployed_capacity_gbps", label: "Deployed capacity (Gbps)" },
        ],
        defaultCategory: "ix",
        defaultMetric: "deployed_capacity_gbps",
        defaultSeries: "metro",
        defaultChart: "stacked_bar",
      },
      facility_presence: {
        key: "facility_presence",
        label: "Facility presence",
        description: "One row per network per facility per metro. Useful for DC footprints, operator analysis, and presence mapping.",
        rows: facilityPresenceInsightRows,
        dimensions: [
          { key: "metro", label: "Metro" },
          { key: "region", label: "Region" },
          { key: "facility", label: "Facility" },
          { key: "facility_city", label: "Facility city" },
          { key: "facility_operator", label: "Facility operator" },
          { key: "network_name", label: "Network name" },
          { key: "asn", label: "ASN" },
          { key: "network_type", label: "Network type" },
          { key: "origin_country", label: "Origin country" },
          { key: "origin_city", label: "Origin city" },
        ],
        metrics: [
          { key: "facility_presences", label: "Facility/DC presences", format: "count" },
          { key: "record_count", label: "Facility rows", format: "count" },
        ],
        seriesOptions: [
          { key: "metro", label: "Metro" },
          { key: "region", label: "Region" },
          { key: "facility_operator", label: "Facility operator" },
          { key: "facility_city", label: "Facility city" },
          { key: "network_type", label: "Network type" },
          { key: "origin_country", label: "Origin country" },
        ],
        tableFields: [
          { key: "metro", label: "Metro" },
          { key: "facility", label: "Facility" },
          { key: "facility_city", label: "Facility city" },
          { key: "facility_operator", label: "Facility operator" },
          { key: "network_name", label: "Network name" },
          { key: "asn", label: "ASN" },
          { key: "network_type", label: "Network type" },
          { key: "origin_country", label: "Origin country" },
          { key: "origin_city", label: "Origin city" },
        ],
        defaultCategory: "facility_operator",
        defaultMetric: "facility_presences",
        defaultSeries: "metro",
        defaultChart: "stacked_bar",
      },
    }),
    [facilityPresenceInsightRows, ixDeploymentInsightRows, metroSummaryInsightRows, networkMetroInsightRows]
  );

  const activeInsightDataset = insightDatasets[insightDataset];
  const activeInsightMetricOption =
    activeInsightDataset.metrics.find((metric) => metric.key === insightMetricKey) ||
    activeInsightDataset.metrics[0];

  const insightTemplateOptions = React.useMemo(
    () =>
      [
        {
          key: "capacity_by_metro" as const,
          label: "Capacity by metro",
          description: "Compare total deployed capacity across the metros we loaded.",
        },
        {
          key: "ix_split_for_networks" as const,
          label: "IX split for top networks",
          description: "See which IXs make up each top network's deployed capacity.",
        },
        {
          key: "top_networks" as const,
          label: "Top networks",
          description: "Rank networks by capacity or footprint in the selected metros.",
        },
        {
          key: "origin_analysis" as const,
          label: "Origin analysis",
          description: "Group what you loaded by origin country or city.",
        },
        {
          key: "facility_footprint" as const,
          label: "Facility footprint",
          description: "Understand presence across facilities and facility operators.",
        },
      ] satisfies Array<{ key: InsightTemplate; label: string; description: string }>,
    []
  );

  const availableInsightSeriesOptions = React.useMemo(
    () => activeInsightDataset.seriesOptions.filter((option) => option.key !== insightCategoryField),
    [activeInsightDataset.seriesOptions, insightCategoryField]
  );

  useEffect(() => {
    if (!activeInsightDataset.dimensions.some((field) => field.key === insightCategoryField)) {
      setInsightCategoryField(activeInsightDataset.defaultCategory);
    }
    if (!activeInsightDataset.metrics.some((metric) => metric.key === insightMetricKey)) {
      setInsightMetricKey(activeInsightDataset.defaultMetric);
    }
    const validSeriesKeys = ["none", ...availableInsightSeriesOptions.map((option) => option.key)];
    if (!validSeriesKeys.includes(insightSeriesField)) {
      setInsightSeriesField(
        validSeriesKeys.includes(activeInsightDataset.defaultSeries)
          ? activeInsightDataset.defaultSeries
          : "none"
      );
    }
  }, [
    activeInsightDataset,
    availableInsightSeriesOptions,
    insightCategoryField,
    insightMetricKey,
    insightSeriesField,
  ]);

  useEffect(() => {
    if (insightChartType === "heatmap" && insightSeriesField === "none" && availableInsightSeriesOptions.length > 0) {
      setInsightSeriesField(availableInsightSeriesOptions[0].key);
    }
  }, [availableInsightSeriesOptions, insightChartType, insightSeriesField]);

  useEffect(() => {
    if (insightChartType === "stacked_bar" && insightSeriesField === "none" && availableInsightSeriesOptions.length > 0) {
      setInsightSeriesField(availableInsightSeriesOptions[0].key);
    }
  }, [availableInsightSeriesOptions, insightChartType, insightSeriesField]);

  const insightFieldLabelMap = React.useMemo(() => {
    const entries = [...activeInsightDataset.dimensions, ...activeInsightDataset.metrics].map((field) => [
      field.key,
      field.label,
    ]);
    return Object.fromEntries(entries) as Record<string, string>;
  }, [activeInsightDataset.dimensions, activeInsightDataset.metrics]);

  const insightBuilderSummary = React.useMemo(() => {
    const categoryLabel = insightFieldLabelMap[insightCategoryField] || insightCategoryField;
    const metricLabel = activeInsightMetricOption.label;
    const chartLabelMap: Record<InsightsChartType, string> = {
      bar: "bar chart",
      stacked_bar: "stacked bar chart",
      heatmap: "heatmap",
      table: "table",
    };
    const seriesLabel =
      insightSeriesField !== "none" ? insightFieldLabelMap[insightSeriesField] || insightSeriesField : null;

    return `Showing ${metricLabel.toLowerCase()} grouped by ${categoryLabel.toLowerCase()}${
      seriesLabel && insightChartType !== "bar" && insightChartType !== "table"
        ? `, split by ${seriesLabel.toLowerCase()}`
        : ""
    }, as a ${chartLabelMap[insightChartType]}.`;
  }, [
    activeInsightMetricOption.label,
    insightCategoryField,
    insightChartType,
    insightFieldLabelMap,
    insightSeriesField,
  ]);

  const insightSearchTokens = React.useMemo(
    () =>
      insightSearchText
        .split(/[\s,]+/)
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean),
    [insightSearchText]
  );

  const insightMetroOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          activeInsightDataset.rows
            .map((row) => row.metro)
            .filter((value): value is InsightRecordValue => value !== undefined && value !== null)
            .map((value) => String(value))
        )
      )
        .filter((metro): metro is MetroKey => metro in METROS)
        .sort(),
    [activeInsightDataset.rows]
  );

  const insightNetworkTypeOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          activeInsightDataset.rows
            .map((row) => row.network_type)
            .filter((value): value is InsightRecordValue => value !== undefined && value !== null && String(value) !== "")
            .map((value) => String(value))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [activeInsightDataset.rows]
  );

  const insightOriginCountryOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          activeInsightDataset.rows
            .map((row) => row.origin_country)
            .filter((value): value is InsightRecordValue => value !== undefined && value !== null && String(value) !== "")
            .map((value) => String(value))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [activeInsightDataset.rows]
  );

  const insightPresenceTypeOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          activeInsightDataset.rows
            .map((row) => row.presence_type)
            .filter((value): value is InsightRecordValue => value !== undefined && value !== null && String(value) !== "")
            .map((value) => String(value))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [activeInsightDataset.rows]
  );

  const filteredInsightRows = React.useMemo(() => {
    return activeInsightDataset.rows.filter((row) => {
      if (
        insightMetroFilter.length > 0 &&
        row.metro !== undefined &&
        !insightMetroFilter.includes(String(row.metro) as MetroKey)
      ) {
        return false;
      }
      if (
        insightNetworkTypeFilter.length > 0 &&
        row.network_type !== undefined &&
        !insightNetworkTypeFilter.includes(String(row.network_type))
      ) {
        return false;
      }
      if (
        insightOriginCountryFilter.length > 0 &&
        row.origin_country !== undefined &&
        !insightOriginCountryFilter.includes(String(row.origin_country))
      ) {
        return false;
      }
      if (
        insightPresenceTypeFilter.length > 0 &&
        row.presence_type !== undefined &&
        !insightPresenceTypeFilter.includes(String(row.presence_type))
      ) {
        return false;
      }

      if (insightSearchTokens.length > 0) {
        const haystack = Object.entries(row)
          .filter(([key]) => key !== "row_id")
          .map(([, value]) => String(value).toLowerCase())
          .join(" ");
        if (!insightSearchTokens.every((token) => haystack.includes(token))) {
          return false;
        }
      }

      return true;
    });
  }, [
    activeInsightDataset.rows,
    insightMetroFilter,
    insightNetworkTypeFilter,
    insightOriginCountryFilter,
    insightPresenceTypeFilter,
    insightSearchTokens,
  ]);

  const insightMetricFormatter = React.useCallback(
    (value: number) =>
      activeInsightMetricOption?.format === "capacity" ? formatCapacity(value) : formatCount(Math.round(value)),
    [activeInsightMetricOption]
  );

  const insightChartData = React.useMemo(() => {
    type SegmentValue = { key: string; label: string; value: number };

    const metricKey = insightMetricKey;
    const groups = new Map<string, { label: string; total: number; segments: Map<string, SegmentValue> }>();
    const useSeries = insightChartType !== "bar" && insightChartType !== "table" && insightSeriesField !== "none";

    filteredInsightRows.forEach((row) => {
      const categoryLabel = String(row[insightCategoryField] ?? "Unknown");
      const metricValue = Number(row[metricKey] ?? 0);
      if (!Number.isFinite(metricValue) || metricValue <= 0) return;

      if (!groups.has(categoryLabel)) {
        groups.set(categoryLabel, {
          label: categoryLabel,
          total: 0,
          segments: new Map<string, SegmentValue>(),
        });
      }

      const group = groups.get(categoryLabel)!;
      group.total += metricValue;

      const seriesLabel = useSeries ? String(row[insightSeriesField] ?? "Unknown") : activeInsightMetricOption.label;
      const seriesKey = useSeries ? `${insightSeriesField}:${seriesLabel}` : "total";

      if (!group.segments.has(seriesKey)) {
        group.segments.set(seriesKey, {
          key: seriesKey,
          label: seriesLabel,
          value: 0,
        });
      }

      group.segments.get(seriesKey)!.value += metricValue;
    });

    let rows = Array.from(groups.values())
      .map((group) => ({
        label: group.label,
        total: group.total,
        segments: Array.from(group.segments.values()).sort((a, b) => b.value - a.value),
      }))
      .filter((row) => row.total > 0);

    rows.sort((a, b) => {
      if (insightSortBy === "category") {
        return insightSortDirection === "asc"
          ? a.label.localeCompare(b.label)
          : b.label.localeCompare(a.label);
      }
      return insightSortDirection === "asc" ? a.total - b.total : b.total - a.total;
    });

    const limitedRows = insightTopN > 0 ? rows.slice(0, insightTopN) : rows;
    const seriesLabels = Array.from(
      new Set(limitedRows.flatMap((row) => row.segments.map((segment) => segment.label)))
    );

    const palette = [
      "#38bdf8",
      "#818cf8",
      "#22c55e",
      "#f59e0b",
      "#ef4444",
      "#14b8a6",
      "#eab308",
      "#a855f7",
      "#06b6d4",
      "#f97316",
    ];

    const seriesColorMap: Record<string, string> = {};
    seriesLabels.forEach((label, index) => {
      if (insightSeriesField === "ix") {
        const matchingIx = ixColumnsSorted.find((ix) => (ix.name || `IX ${ix.id}`) === label);
        if (matchingIx) {
          seriesColorMap[label] = ixColors[matchingIx.id] || palette[index % palette.length];
          return;
        }
      }
      seriesColorMap[label] = palette[index % palette.length];
    });

    const maxTotal = limitedRows.reduce((max, row) => Math.max(max, row.total), 0);
    return {
      rows: limitedRows,
      seriesLabels,
      seriesColorMap,
      maxTotal,
    };
  }, [
    activeInsightMetricOption,
    filteredInsightRows,
    insightCategoryField,
    insightChartType,
    insightMetricKey,
    insightSeriesField,
    insightSortBy,
    insightSortDirection,
    insightTopN,
    ixColors,
    ixColumnsSorted,
  ]);

  const insightMinPositiveTotal = React.useMemo(() => {
    const min = insightChartData.rows.reduce((smallest, row) => {
      if (row.total <= 0) return smallest;
      return Math.min(smallest, row.total);
    }, Number.POSITIVE_INFINITY);
    return Number.isFinite(min) ? min : 0;
  }, [insightChartData.rows]);

  const insightValueSpread = React.useMemo(() => {
    if (!insightChartData.maxTotal || !insightMinPositiveTotal) return 0;
    return insightChartData.maxTotal / Math.max(insightMinPositiveTotal, 1);
  }, [insightChartData.maxTotal, insightMinPositiveTotal]);

  const insightEffectiveScale = React.useMemo<"linear" | "log">(() => {
    if (insightChartType !== "bar" && insightChartType !== "stacked_bar") return "linear";
    if (insightValueScale === "linear") return "linear";
    if (insightValueScale === "log") return "log";
    if (!insightChartData.maxTotal || !insightMinPositiveTotal) return "linear";
    return insightValueSpread >= 40 ? "log" : "linear";
  }, [insightChartData.maxTotal, insightChartType, insightMinPositiveTotal, insightValueScale, insightValueSpread]);

  const getInsightScaledFraction = React.useCallback(
    (value: number) => {
      if (!Number.isFinite(value) || value <= 0 || insightChartData.maxTotal <= 0) return 0;
      if (insightEffectiveScale === "log") {
        return Math.log10(value + 1) / Math.log10(insightChartData.maxTotal + 1);
      }
      return value / insightChartData.maxTotal;
    },
    [insightChartData.maxTotal, insightEffectiveScale]
  );

  const insightAxisTicks = React.useMemo(() => {
    if ((insightChartType !== "bar" && insightChartType !== "stacked_bar") || insightChartData.maxTotal <= 0) {
      return [] as Array<{ value: number; label: string; leftPct: number }>;
    }

    const values =
      insightEffectiveScale === "log"
        ? (() => {
            const ticks = new Set<number>([1]);
            let value = 1;
            while (value < insightChartData.maxTotal) {
              ticks.add(value);
              value *= 10;
            }
            ticks.add(insightChartData.maxTotal);
            return Array.from(ticks)
              .filter((tick) => tick <= insightChartData.maxTotal)
              .sort((a, b) => a - b);
          })()
        : Array.from({ length: 5 }, (_, index) => (insightChartData.maxTotal / 4) * index);

    return values.map((value) => ({
      value,
      label: insightMetricFormatter(value),
      leftPct: getInsightScaledFraction(value) * 100,
    }));
  }, [
    getInsightScaledFraction,
    insightChartData.maxTotal,
    insightChartType,
    insightEffectiveScale,
    insightMetricFormatter,
  ]);

  const insightHeatmapRows = React.useMemo(() => {
    if (insightChartType !== "heatmap" || insightSeriesField === "none") return [] as Array<{
      label: string;
      values: Record<string, number>;
      total: number;
    }>;

    return insightChartData.rows.map((row) => ({
      label: row.label,
      total: row.total,
      values: Object.fromEntries(row.segments.map((segment) => [segment.label, segment.value])),
    }));
  }, [insightChartData.rows, insightChartType, insightSeriesField]);

  const maxInsightHeatmapValue = React.useMemo(
    () =>
      insightHeatmapRows.reduce((max, row) => {
        const rowMax = Object.values(row.values).reduce((rowMaxValue, value) => Math.max(rowMaxValue, value), 0);
        return Math.max(max, rowMax);
      }, 0),
    [insightHeatmapRows]
  );

  const insightTableRows = React.useMemo(() => {
    const rows = [...filteredInsightRows];
    rows.sort((a, b) => {
      if (insightSortBy === "category") {
        const aLabel = String(a[insightCategoryField] ?? "");
        const bLabel = String(b[insightCategoryField] ?? "");
        return insightSortDirection === "asc" ? aLabel.localeCompare(bLabel) : bLabel.localeCompare(aLabel);
      }

      const aValue = Number(a[insightMetricKey] ?? 0);
      const bValue = Number(b[insightMetricKey] ?? 0);
      return insightSortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });
    return rows.slice(0, 120);
  }, [filteredInsightRows, insightCategoryField, insightMetricKey, insightSortBy, insightSortDirection]);

  const formatInsightCell = React.useCallback((fieldKey: string, value: InsightRecordValue) => {
    if (typeof value === "number") {
      if (fieldKey === "asn") return String(value);
      if (fieldKey.includes("capacity")) return formatCapacity(value);
      return formatCount(Math.round(value));
    }
    return String(value);
  }, []);

  const insightGuidance = React.useMemo(() => {
    const actions: InsightGuidanceAction[] = [];
    const categoryCount = insightChartData.rows.length;
    const columnCount = insightChartData.seriesLabels.length;
    const hasNetworkNameCategory = activeInsightDataset.dimensions.some((field) => field.key === "network_name");
    const hasOriginCountryCategory = activeInsightDataset.dimensions.some((field) => field.key === "origin_country");
    const hasMetroSeries = availableInsightSeriesOptions.some((field) => field.key === "metro");
    const hasIxSeries = availableInsightSeriesOptions.some((field) => field.key === "ix");

    if (filteredInsightRows.length === 0) {
      return {
        tone: "warning" as const,
        title: "No rows match the current filters",
        description: "The builder cannot draw a meaningful result until some filtered rows remain.",
        actions: ["clear_all_filters"] as InsightGuidanceAction[],
      };
    }

    if (insightChartType === "heatmap") {
      if (categoryCount < 2 || columnCount < 2) {
        if (hasNetworkNameCategory && insightCategoryField !== "network_name") actions.push("set_category_network_name");
        if (hasMetroSeries && insightSeriesField !== "metro") actions.push("set_series_metro");
        if (insightMetroFilter.length === 1 && insightMetroOptions.length > 1) actions.push("clear_metro_filter");
        actions.push("switch_to_table");

        return {
          tone: "warning" as const,
          title: "This heatmap is too thin to be useful",
          description: `After the current filters, the heatmap only has ${formatCount(categoryCount)} row${categoryCount === 1 ? "" : "s"} and ${formatCount(columnCount)} column${columnCount === 1 ? "" : "s"}. Heatmaps work best when both sides have multiple values to compare.`,
          actions,
        };
      }
    }

    if (insightChartType === "stacked_bar" && columnCount < 2) {
      if (insightDataset === "ix_deployment" && hasIxSeries && insightSeriesField !== "ix") {
        actions.unshift("set_series_ix");
      }
      actions.push("switch_to_bar");
      if (hasMetroSeries && insightSeriesField !== "metro") actions.push("set_series_metro");
      if (insightMetroFilter.length === 1 && insightMetroOptions.length > 1) actions.push("clear_metro_filter");
      return {
        tone: "warning" as const,
        title: "This stacked bar only has one series",
        description: "A stacked bar is most useful when the color split compares multiple segments. Right now it collapses to a single segment.",
        actions,
      };
    }

    if (insightChartType === "bar" && categoryCount === 1 && insightMetroFilter.length === 1 && insightMetroOptions.length > 1) {
      actions.push("clear_metro_filter");
      if (hasNetworkNameCategory && insightCategoryField !== "network_name") actions.push("set_category_network_name");
      if (hasOriginCountryCategory && insightCategoryField !== "origin_country") actions.push("set_category_origin_country");
      return {
        tone: "info" as const,
        title: "This bar chart is valid but very narrow",
        description: "You are looking at a single category after filtering. That can be useful, but it is not a strong comparison view yet.",
        actions,
      };
    }

    return null;
  }, [
    activeInsightDataset.dimensions,
    availableInsightSeriesOptions,
    filteredInsightRows.length,
    insightCategoryField,
    insightChartData.rows.length,
    insightChartData.seriesLabels.length,
    insightChartType,
    insightDataset,
    insightMetroFilter.length,
    insightMetroOptions.length,
    insightSeriesField,
  ]);

  const insightRecommendation = React.useMemo(() => {
    if (filteredInsightRows.length === 0) return null as null | {
      chartType: InsightsChartType;
      action: InsightGuidanceAction;
      title: string;
      description: string;
    };

    const categoryCount = insightChartData.rows.length;
    const columnCount = insightChartData.seriesLabels.length;

    if (
      insightDataset === "network_metro" &&
      insightCategoryField === "network_name" &&
      insightSeriesField === "metro" &&
      categoryCount >= 2 &&
      columnCount >= 2 &&
      insightChartType !== "heatmap"
    ) {
      return {
        chartType: "heatmap" as const,
        action: "switch_to_heatmap" as const,
        title: "Recommended chart: Heatmap",
        description:
          "Network-by-metro comparisons are easier to scan as a heatmap because each cell becomes a direct footprint comparison.",
      };
    }

    if (
      (insightChartType === "bar" || insightChartType === "table") &&
      insightSeriesField !== "none" &&
      columnCount >= 2 &&
      categoryCount >= 2
    ) {
      return {
        chartType: "stacked_bar" as const,
        action: "switch_to_stacked_bar" as const,
        title: "Recommended chart: Stacked bar",
        description:
          "This setup has multiple series, so a stacked bar will show the split much more clearly than a plain bar or table.",
      };
    }

    if (insightChartType === "heatmap" && (categoryCount < 2 || columnCount < 2)) {
      return {
        chartType: categoryCount <= 1 ? ("table" as const) : ("bar" as const),
        action: categoryCount <= 1 ? ("switch_to_table" as const) : ("switch_to_bar" as const),
        title: `Recommended chart: ${categoryCount <= 1 ? "Table" : "Bar"}`,
        description:
          "The current filters collapse this heatmap too far. A table or bar chart will read more clearly until there are more rows and columns again.",
      };
    }

    if (insightChartType === "table" && categoryCount >= 2 && categoryCount <= 20) {
      return {
        chartType: "bar" as const,
        action: "switch_to_bar" as const,
        title: "Recommended chart: Bar",
        description:
          "This result is small enough to chart cleanly, so a bar chart will make the ranking easier to scan than the table alone.",
      };
    }

    return null;
  }, [
    filteredInsightRows.length,
    insightCategoryField,
    insightChartData.rows.length,
    insightChartData.seriesLabels.length,
    insightChartType,
    insightDataset,
    insightSeriesField,
  ]);

  // ---- CSV helpers ----
  const escapeCsvCell = (value: string): string => {
    if (value == null) return "";
    const v = value.replace(/"/g, '""');
    const needsQuotes = /[",\n]/.test(v) || /^\s|\s$/.test(v);
    return needsQuotes ? `"${v}"` : v;
  };

  const downloadCsv = (filename: string, rows: string[][]) => {
    if (rows.length === 0) return;
    const csv = rows
      .map((row) => row.map((cell) => escapeCsvCell(cell ?? "")).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadIxCsv = () => {
    if (sortedNetworks.length === 0 || ixColumnsSorted.length === 0) return;
    const header = ["ASN", "Name", ...ixColumnsSorted.map((ix) => ix.name as string)];
    const rows = sortedNetworks.map((net) => {
      const asnStr = net.asn != null ? String(net.asn) : "";
      const nameStr = net.name ?? "";
      const cols = ixColumnsSorted.map((ix) => {
        const capMbps = net.ixCaps.get(ix.id) ?? 0;
        const capGbps = capMbps / 1000;
        return capGbps > 0 ? String(Math.round(capGbps * 10) / 10) : "";
      });
      return [asnStr, nameStr, ...cols];
    });
    downloadCsv("peeringdb_ix_matrix.csv", [header, ...rows]);
  };

  const handleDownloadFacCsv = () => {
    if (sortedNetworks.length === 0 || facColumnsFlat.length === 0) return;
    const header = ["ASN", "Name", ...facColumnsFlat.map((fac) => fac.name as string)];
    const rows = sortedNetworks.map((net) => {
      const asnStr = net.asn != null ? String(net.asn) : "";
      const nameStr = net.name ?? "";
      const cols = facColumnsFlat.map((fac) => (net.facIds.has(fac.id) ? "1" : ""));
      return [asnStr, nameStr, ...cols];
    });
    downloadCsv("peeringdb_facility_matrix.csv", [header, ...rows]);
  };

  const handleDownloadPresenceCsv = () => {
    if (presenceGapRows.length === 0 || lastLoadedMetros.length === 0) return;

    const header = [
      "ASN",
      "Name",
      "Present metro count",
      "Metro footprint",
      ...lastLoadedMetros.flatMap((metro) => [
        `${metro} status`,
        `${metro} capacity_gbps`,
        `${metro} facility_presence_count`,
      ]),
    ];

    const rows = presenceGapRows.map((row) => [
      row.net.asn != null ? String(row.net.asn) : "",
      row.net.name ?? "",
      String(row.presentMetroCount),
      row.metroFootprint.join(" | "),
      ...lastLoadedMetros.flatMap((metro) => {
        const summary = row.metroStates[metro];
        return [
          presenceStatusLabel(summary),
          summary?.capacityGbps ? summary.capacityGbps.toFixed(1) : "",
          summary?.facilityPresenceCount ? String(summary.facilityPresenceCount) : "",
        ];
      }),
    ]);

    downloadCsv("peeringdb_presence_gaps.csv", [header, ...rows]);
  };

  const toggleInsightStringFilter = (value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => (prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]));
  };

  const toggleInsightMetroFilter = (metro: MetroKey) => {
    setInsightMetroFilter((prev) =>
      prev.includes(metro) ? prev.filter((entry) => entry !== metro) : [...prev, metro]
    );
  };

  const clearInsightFilters = () => {
    setInsightSearchText("");
    setInsightMetroFilter([]);
    setInsightNetworkTypeFilter([]);
    setInsightOriginCountryFilter([]);
    setInsightPresenceTypeFilter([]);
  };

  const applyInsightTemplate = (template: InsightTemplate) => {
    setSelectedInsightTemplate(template);
    clearInsightFilters();
    setShowInsightFilters(false);
    setShowInsightAdvancedFilters(false);
    setShowInsightChartOptions(false);
    setInsightValueScale("auto");

    switch (template) {
      case "capacity_by_metro":
        setInsightDataset("metro_summary");
        setInsightChartType("bar");
        setInsightCategoryField("metro");
        setInsightMetricKey("deployed_capacity_gbps");
        setInsightSeriesField("none");
        setInsightSortBy("metric");
        setInsightSortDirection("desc");
        setInsightTopN(0);
        return;
      case "ix_split_for_networks":
        setInsightDataset("ix_deployment");
        setInsightChartType("stacked_bar");
        setInsightCategoryField("network_name");
        setInsightMetricKey("deployed_capacity_gbps");
        setInsightSeriesField("ix");
        setInsightSortBy("metric");
        setInsightSortDirection("desc");
        setInsightTopN(15);
        return;
      case "top_networks":
        setInsightDataset("network_metro");
        setInsightChartType("bar");
        setInsightCategoryField("network_name");
        setInsightMetricKey("deployed_capacity_gbps");
        setInsightSeriesField("none");
        setInsightSortBy("metric");
        setInsightSortDirection("desc");
        setInsightTopN(20);
        return;
      case "origin_analysis":
        setInsightDataset("network_metro");
        setInsightChartType("stacked_bar");
        setInsightCategoryField("origin_country");
        setInsightMetricKey("deployed_capacity_gbps");
        setInsightSeriesField("metro");
        setInsightSortBy("metric");
        setInsightSortDirection("desc");
        setInsightTopN(20);
        return;
      case "facility_footprint":
        setInsightDataset("facility_presence");
        setInsightChartType("stacked_bar");
        setInsightCategoryField("facility_operator");
        setInsightMetricKey("facility_presences");
        setInsightSeriesField("metro");
        setInsightSortBy("metric");
        setInsightSortDirection("desc");
        setInsightTopN(20);
        return;
      default:
        return;
    }
  };

  const applyInsightGuidanceAction = (action: InsightGuidanceAction) => {
    switch (action) {
      case "switch_to_table":
        setInsightChartType("table");
        return;
      case "switch_to_bar":
        setInsightChartType("bar");
        if (insightSeriesField === "none" && availableInsightSeriesOptions.length > 0) {
          setInsightSeriesField(availableInsightSeriesOptions[0].key);
        }
        return;
      case "switch_to_stacked_bar":
        setInsightChartType("stacked_bar");
        if (insightSeriesField === "none" && availableInsightSeriesOptions.length > 0) {
          setInsightSeriesField(availableInsightSeriesOptions[0].key);
        }
        return;
      case "switch_to_heatmap":
        setInsightChartType("heatmap");
        if (insightSeriesField === "none" && availableInsightSeriesOptions.length > 0) {
          setInsightSeriesField(availableInsightSeriesOptions[0].key);
        }
        return;
      case "set_category_network_name":
        setInsightCategoryField("network_name");
        if (insightTopN === 0) setInsightTopN(20);
        return;
      case "set_category_origin_country":
        setInsightCategoryField("origin_country");
        return;
      case "set_series_ix":
        setInsightSeriesField("ix");
        if (insightChartType === "bar") setInsightChartType("stacked_bar");
        return;
      case "set_series_metro":
        setInsightSeriesField("metro");
        if (insightChartType === "bar") setInsightChartType("stacked_bar");
        return;
      case "clear_metro_filter":
        setInsightMetroFilter([]);
        return;
      case "clear_all_filters":
        clearInsightFilters();
        return;
      default:
        return;
    }
  };

  const handleDownloadInsightRowsCsv = () => {
    if (filteredInsightRows.length === 0) return;
    const header = activeInsightDataset.tableFields.map((field) => field.label);
    const rows = filteredInsightRows.map((row) =>
      activeInsightDataset.tableFields.map((field) =>
        row[field.key] === undefined || row[field.key] === null ? "" : String(row[field.key])
      )
    );
    downloadCsv(`peeringdb_${activeInsightDataset.key}_rows.csv`, [header, ...rows]);
  };

  const handleDownloadInsightChartCsv = () => {
    if (insightChartType === "table" || insightChartData.rows.length === 0) return;

    if (insightChartType === "heatmap") {
      const header = [
        insightFieldLabelMap[insightCategoryField] || insightCategoryField,
        ...(insightChartData.seriesLabels || []),
        "Total",
      ];
      const rows = insightHeatmapRows.map((row) => [
        row.label,
        ...insightChartData.seriesLabels.map((label) =>
          row.values[label] != null ? String(row.values[label]) : ""
        ),
        String(row.total),
      ]);
      downloadCsv(`peeringdb_${activeInsightDataset.key}_heatmap.csv`, [header, ...rows]);
      return;
    }

    const header = [
      insightFieldLabelMap[insightCategoryField] || insightCategoryField,
      ...(insightChartData.seriesLabels || []),
      "Total",
    ];
    const rows = insightChartData.rows.map((row) => {
      const segmentMap = Object.fromEntries(row.segments.map((segment) => [segment.label, segment.value]));
      return [
        row.label,
        ...insightChartData.seriesLabels.map((label) =>
          segmentMap[label] != null ? String(segmentMap[label]) : ""
        ),
        String(row.total),
      ];
    });
    downloadCsv(`peeringdb_${activeInsightDataset.key}_chart.csv`, [header, ...rows]);
  };

  // ---- Layout helpers ----
  const headerCellBase: React.CSSProperties = {
    padding: "6px 8px",
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: theme.tableHeaderBg,
    borderRight: `1px solid ${theme.tableHeaderBorder}`,
    borderBottom: `1px solid ${theme.tableHeaderBorder}`,
  };

  const bodyCellBase: React.CSSProperties = {
    padding: "6px 8px",
    borderRight: `1px solid ${theme.gridBorder}`,
  };

  const ixTableMinWidth = Math.max(
    BASE_TABLE_MIN_WIDTH,
    80 + nameColWidth + ixColumnsSorted.length * DATA_COL_MIN_WIDTH
  );

  const facTableMinWidth = Math.max(
    BASE_TABLE_MIN_WIDTH,
    80 + nameColWidth + facColumnsFlat.length * DATA_COL_MIN_WIDTH
  );

  // ---- Metro & filter UI helpers ----
  const toggleMetroSelection = (m: MetroKey) => {
    setSelectedMetros((prev) => {
      const exists = prev.includes(m);
      if (exists) {
        if (prev.length === 1) return prev; // keep at least one metro selected
        return prev.filter((x) => x !== m);
      }
      return [...prev, m];
    });
  };

  const selectAllRegionMetros = (region: MetroRegion) => {
    setSelectedMetros((prev) => {
      const next = new Set(prev);
      METROS_BY_REGION[region].forEach((metro) => next.add(metro));
      return Array.from(next);
    });
  };

  const clearRegionMetros = (region: MetroRegion) => {
    setSelectedMetros((prev) => {
      const next = prev.filter((metro) => METROS[metro].region !== region);
      return next.length > 0 ? next : prev;
    });
  };

  const toggleGapSourceMetro = (metro: MetroKey) => {
    setGapSourceMetros((prev) => {
      const exists = prev.includes(metro);
      const next = exists ? prev.filter((item) => item !== metro) : [...prev, metro];
      if (!exists) {
        setGapTargetMetros((targets) => targets.filter((item) => item !== metro));
      }
      return next.length > 0 ? next : prev;
    });
  };

  const toggleGapTargetMetro = (metro: MetroKey) => {
    setGapTargetMetros((prev) => {
      const exists = prev.includes(metro);
      const next = exists ? prev.filter((item) => item !== metro) : [...prev, metro];
      if (!exists) {
        setGapSourceMetros((sources) => sources.filter((item) => item !== metro));
      }
      return next;
    });
  };

  const toggleIxSelection = (id: number) => {
    setSelectedIxIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleFacSelection = (id: number) => {
    setSelectedFacIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const ixSearchLower = ixSearch.trim().toLowerCase();
  const facSearchLower = facSearch.trim().toLowerCase();

  const ixOptions = [...ixData]
    .filter((ix) =>
      ixSearchLower ? (ix.name || "").toLowerCase().includes(ixSearchLower) : true
    )
    .sort((a, b) => {
      const aName = (a.name || "").toLowerCase();
      const bName = (b.name || "").toLowerCase();
      const aEq = aName.includes("equinix");
      const bEq = bName.includes("equinix");
      if (aEq && !bEq) return -1;
      if (!aEq && bEq) return 1;
      return aName.localeCompare(bName);
    });

  const facOptions = facData.filter((fac) =>
    facSearchLower ? (fac.name || "").toLowerCase().includes(facSearchLower) : true
  );

  // ---- render ----
  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.appBg,
        color: theme.textPrimary,
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
        fontSize: 15,
      }}
    >
      {/* HEADER */}
      <header
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${theme.headerBorder}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: theme.headerBg,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>PeeringDB – Metro ASN × IX / Facility Matrix</h2>
          <div style={{ fontSize: 14, color: theme.textMuted, marginTop: 4 }}>
            Metro selection (for next load): <strong>{metroLabel}</strong>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
            position: "relative",
            maxWidth: "58%",
          }}
          ref={metroSelectorRef}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setActiveView("matrices")}
              style={{
                color: activeView === "matrices" ? "#052e16" : theme.textPrimary,
                border: `1px solid ${activeView === "matrices" ? "#22c55e" : theme.cardBorder}`,
                borderRadius: 9999,
                padding: "8px 12px",
                fontSize: 14,
                background: activeView === "matrices" ? "#86efac" : "#0f172a",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Matrix view
            </button>
            <button
              type="button"
              onClick={() => setActiveView("compare")}
              style={{
                color: activeView === "compare" ? "#082f49" : theme.textPrimary,
                border: `1px solid ${activeView === "compare" ? "#38bdf8" : theme.cardBorder}`,
                borderRadius: 9999,
                padding: "8px 12px",
                fontSize: 14,
                background: activeView === "compare" ? "#bae6fd" : "#0f172a",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Compare metros
            </button>
            <button
              type="button"
              onClick={() => setActiveView("insights")}
              style={{
                color: activeView === "insights" ? "#172554" : theme.textPrimary,
                border: `1px solid ${activeView === "insights" ? "#818cf8" : theme.cardBorder}`,
                borderRadius: 9999,
                padding: "8px 12px",
                fontSize: 14,
                background: activeView === "insights" ? "#c7d2fe" : "#0f172a",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Insights builder
            </button>
            <Link
              to="/downloads"
              style={{
                color: theme.textPrimary,
                textDecoration: "none",
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: 9999,
                padding: "8px 12px",
                fontSize: 14,
                background: "#0f172a",
              }}
            >
              Open downloads
            </Link>
          </div>
          <div
            style={{
              fontSize: 14,
              color: theme.textSoft,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "flex-end",
              maxWidth: "100%",
              paddingBottom: 4,
            }}
          >
            {REGION_ORDER.map((region) => {
              const selectedCount = selectedCountsByRegion[region];
              const isOpen = openMetroRegion === region;
              return (
                <button
                  key={`region-${region}`}
                  type="button"
                  onClick={() => setOpenMetroRegion((prev) => (prev === region ? null : region))}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 9999,
                    border: `1px solid ${isOpen ? "#38bdf8" : selectedCount > 0 ? "#22c55e" : theme.pillBorder}`,
                    background: isOpen ? "#082f49" : "#0f172a",
                    color: theme.textPrimary,
                    cursor: "pointer",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>{region}</span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 22,
                      height: 22,
                      padding: "0 6px",
                      borderRadius: 9999,
                      background: selectedCount > 0 ? "#14532d" : "#111827",
                      color: selectedCount > 0 ? "#bbf7d0" : theme.textMuted,
                      fontSize: 13,
                    }}
                  >
                    {selectedCount}
                  </span>
                </button>
              );
            })}
          </div>

          {openMetroRegion && (
            <div
              style={{
                position: "absolute",
                top: 88,
                right: 0,
                width: 360,
                maxWidth: "100%",
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${theme.cardBorder}`,
                background: "#020617",
                boxShadow: "0 18px 42px rgba(0,0,0,0.45)",
                zIndex: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 10,
                }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: theme.textMuted, textTransform: "uppercase" }}>
                      Region selector
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{openMetroRegion}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => selectAllRegionMetros(openMetroRegion)}
                      style={{
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 9999,
                        padding: "6px 10px",
                        background: "#0f172a",
                        color: theme.textSoft,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => clearRegionMetros(openMetroRegion)}
                      style={{
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 9999,
                        padding: "6px 10px",
                        background: "#0f172a",
                        color: theme.textSoft,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Clear region
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenMetroRegion(null)}
                      style={{
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 9999,
                        padding: "6px 10px",
                        background: "#0f172a",
                        color: theme.textSoft,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Close
                    </button>
                  </div>
              </div>

              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
                Pick the metros you want in the next load. This keeps the top bar tidy while still
                letting us expand across APAC, EMEA, and AMER.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                {METROS_BY_REGION[openMetroRegion].map((metro) => (
                  <label
                    key={`metro-picker-${metro}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: `1px solid ${selectedMetros.includes(metro) ? "#22c55e" : theme.cardBorder}`,
                      background: selectedMetros.includes(metro) ? "#072d1f" : "#0b1120",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMetros.includes(metro)}
                      onChange={() => toggleMetroSelection(metro)}
                      style={{ accentColor: "#22c55e" }}
                    />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ color: theme.textPrimary }}>{metro}</span>
                      <span style={{ fontSize: 11, color: theme.textMuted }}>
                        {METROS[metro].city}, {METROS[metro].country}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              fontSize: 13,
              color: theme.textMuted,
              textAlign: "right",
              maxWidth: 520,
              lineHeight: 1.5,
            }}
          >
            Selected metros: <strong style={{ color: theme.textPrimary }}>{metroLabel}</strong>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "flex-end",
              maxWidth: 520,
            }}
          >
            {selectedMetros.map((metro) => (
              <button
                key={`selected-pill-${metro}`}
                type="button"
                onClick={() => toggleMetroSelection(metro)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 9999,
                  border: `1px solid ${theme.cardBorder}`,
                  background: "#0b1120",
                  color: theme.textPrimary,
                  cursor: "pointer",
                  fontSize: 13,
                }}
                title={`Remove ${metro} from selection`}
              >
                <span>{metro}</span>
                <span style={{ color: "#fca5a5", fontWeight: 700 }}>×</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* SIDEBAR */}
        <aside
          style={{
            width: sidebarWidth,
            borderRight: `1px solid ${theme.headerBorder}`,
            padding: 12,
            paddingRight: 10,
            fontSize: 14,
            overflowY: "auto",
            background: "#020617",
          }}
        >
          {/* Summary box */}
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 8,
              background: theme.cardBg,
              border: `1px solid ${theme.cardBorder}`,
            }}
          >
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4, fontWeight: 600 }}>
              Summary
            </div>
            <div>IXes in loaded metros: {ixData.length}</div>
            <div>Facilities in loaded metros: {facData.length}</div>
          </div>

          <div
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 8,
              background: theme.cardBg,
              border: `1px solid ${theme.cardBorder}`,
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: theme.textMuted,
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              Snapshot downloads
            </div>
            {process.env.NODE_ENV === "development" && (
              <div style={{ color: theme.textMuted, marginBottom: 6 }}>
                Hidden in local preview.
              </div>
            )}
            {snapshotLoading && <div style={{ color: theme.textMuted }}>Loading snapshot links…</div>}
            {snapshotError && (
              <div style={{ color: "#fca5a5", marginBottom: 6, lineHeight: 1.4 }}>
                {snapshotError}
              </div>
            )}
            {!snapshotLoading &&
              !snapshotError &&
              snapshotRuns.length === 0 &&
              process.env.NODE_ENV !== "development" && (
              <div style={{ color: theme.textMuted }}>No completed snapshots found.</div>
              )}
            {snapshotRuns.slice(0, 3).map((run) => (
              <div key={run.snapshotDate} style={{ marginBottom: 8 }}>
                <div style={{ marginBottom: 2 }}>
                  <strong>{run.snapshotDate}</strong>
                  {run.netCount != null && run.orgCount != null && (
                    <span style={{ color: theme.textMuted }}>
                      {" "}
                      ({run.netCount} nets / {run.orgCount} orgs)
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {run.netUrl && (
                    <a href={run.netUrl} target="_blank" rel="noreferrer" style={{ color: "#86efac" }}>
                      net.jsonl.gz
                    </a>
                  )}
                  {run.orgUrl && (
                    <a href={run.orgUrl} target="_blank" rel="noreferrer" style={{ color: "#86efac" }}>
                      org.jsonl.gz
                    </a>
                  )}
                  {run.manifestUrl && (
                    <a
                      href={run.manifestUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#86efac" }}
                    >
                      manifest.json
                    </a>
                  )}
                  <a
                    href={run.networksCsvUrl || buildSnapshotCsvUrl(run.snapshotDate)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#86efac" }}
                  >
                    networks.csv
                  </a>
                  {!run.netUrl && !run.orgUrl && !run.manifestUrl && (
                    <span style={{ color: theme.textMuted }}>No downloadable links stored for this run.</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar width control */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 2 }}>
              Sidebar width (px)
            </div>
            <input
              type="range"
              min={260}
              max={420}
              value={sidebarWidth}
              onChange={(e) => setSidebarWidth(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
              {sidebarWidth}px
            </div>
          </div>

          {error && (
            <div
              style={{
                color: "#fecaca",
                background: "#450a0a",
                border: "1px solid #b91c1c",
                borderRadius: 8,
                padding: 8,
                marginBottom: 12,
              }}
            >
              Error: {error}
            </div>
          )}

          <button
            style={{
              width: "100%",
              padding: 10,
              background: "#16a34a",
              color: "#ecfdf5",
              borderRadius: 8,
              border: `1px solid #22c55e`,
              cursor: allNetLoading ? "wait" : "pointer",
              opacity: allNetLoading ? 0.7 : 1,
              fontWeight: 600,
              marginBottom: 6,
            }}
            onClick={handleLoadAllNetworks}
            disabled={allNetLoading}
          >
            {allNetLoading
              ? metroNetworks.length > 0
                ? "Refreshing loaded metros…"
                : "Loading all networks…"
              : "Load all networks in metros"}
          </button>

          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
            Large multi-metro loads can take a while. We’ll keep the current results visible while
            the refresh is in progress.
          </div>

          {loadProgress && (
              <div
                style={{
                  marginBottom: 12,
                  padding: 10,
                  borderRadius: 8,
                  background: theme.cardBgElevated,
                  border: `1px solid ${theme.cardBorder}`,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
                }}
              >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSecondary }}>Load progress</div>
                <div style={{ fontSize: 11, color: theme.textMuted }}>
                  Step {loadProgress.step} / {loadProgress.totalSteps}
                </div>
              </div>

              <div
                style={{
                  height: 10,
                  borderRadius: 9999,
                  overflow: "hidden",
                  background: "#111827",
                  border: `1px solid ${theme.gridBorder}`,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: `${loadPercent}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #22c55e 0%, #38bdf8 60%, #f59e0b 100%)",
                    transition: "width 180ms ease",
                  }}
                />
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: theme.textSecondary }}>
                {loadProgress.stageLabel}
              </div>
              <div style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6, lineHeight: 1.5 }}>
                {loadProgress.detail}
              </div>
              {loadProgress.progressTotal > 0 && (
                <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8 }}>
                  Progress: {formatCount(Math.min(loadProgress.progressCurrent, loadProgress.progressTotal))} /{" "}
                  {formatCount(loadProgress.progressTotal)}
                </div>
              )}
              {loadProgress.throttleMessage && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#fde68a",
                    background: "#3f2a08",
                    border: "1px solid #a16207",
                    borderRadius: 8,
                    padding: 8,
                    marginBottom: 8,
                    lineHeight: 1.5,
                  }}
                >
                  {loadProgress.throttleMessage}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {selectedMetros.map((metro) => {
                  const status = loadProgress.metroStatuses[metro] || "queued";
                  const color =
                    status === "ready"
                      ? theme.successAccent
                      : status === "cached"
                      ? theme.capacityAccent
                      : status === "loading"
                      ? theme.facilityAccent
                      : status === "error"
                      ? theme.dangerAccent
                      : "#6b7280";
                  const label =
                    status === "ready"
                      ? "ready"
                      : status === "cached"
                      ? "cached"
                      : status === "loading"
                      ? "loading"
                      : status === "error"
                      ? "error"
                      : "queued";
                  return (
                    <div
                      key={`load-status-${metro}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 9999,
                            background: color,
                            boxShadow: `0 0 0 2px ${theme.appBg}`,
                          }}
                        />
                        <span>{metro}</span>
                      </div>
                      <span style={{ color: theme.textSecondary, textTransform: "capitalize", fontWeight: 600 }}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {lastLoadedAt && (
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
              Last loaded: {lastLoadedAt.toLocaleString()}
            </div>
          )}
          {lastLoadedMetros.length > 0 && (
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10 }}>
              Data currently loaded for: {loadedMetroLabel}
            </div>
          )}

          {allNetError && (
            <div
              style={{
                marginBottom: 12,
                color: "#fecaca",
                background: "#450a0a",
                border: "1px solid #b91c1c",
                borderRadius: 8,
                padding: 8,
              }}
            >
              Error: {allNetError}
            </div>
          )}

          {metroNetworks.length > 0 && (
            <>
              {/* Network filters */}
              <div
                style={{
                  marginTop: 14,
                  marginBottom: 8,
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Network filters
              </div>
              <div style={{ marginBottom: 4 }}>Filter by ASN (multi):</div>
              <input
                style={{
                  width: "100%",
                  padding: 6,
                  background: theme.cardBg,
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: 6,
                  color: theme.textPrimary,
                  marginBottom: 8,
                }}
                placeholder="e.g. 13335 15169 8075"
                value={asnFilterText}
                onChange={(e) => setAsnFilterText(e.target.value)}
              />
              <div style={{ marginBottom: 4 }}>Filter by network name(s):</div>
              <input
                style={{
                  width: "100%",
                  padding: 6,
                  background: theme.cardBg,
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: 6,
                  color: theme.textPrimary,
                }}
                placeholder="e.g. cloudflare google amazon"
                value={nameFilterText}
                onChange={(e) => setNameFilterText(e.target.value)}
              />

              {/* Name column width */}
              <div style={{ marginTop: 10, marginBottom: 4 }}>Name column width (px):</div>
              <input
                type="number"
                min={120}
                max={400}
                value={nameColWidth}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isNaN(n)) return;
                  const clamped = Math.min(400, Math.max(120, n));
                  setNameColWidth(clamped);
                }}
                style={{
                  width: "100%",
                  padding: 6,
                  background: theme.cardBg,
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: 6,
                  color: theme.textPrimary,
                  marginBottom: 4,
                }}
              />
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>
                Networks (filtered): {sortedNetworks.length} / {metroNetworks.length}
              </div>

              {/* IX filter */}
              <div style={{ marginTop: 4, marginBottom: 4, fontWeight: 700 }}>IX columns</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
                Filter by name, then select/deselect.
              </div>
              <input
                style={{
                  width: "100%",
                  padding: 6,
                  background: theme.cardBg,
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: 6,
                  color: theme.textPrimary,
                  marginBottom: 4,
                }}
                placeholder="Search IX name…"
                value={ixSearch}
                onChange={(e) => setIxSearch(e.target.value)}
              />
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <button
                  type="button"
                  style={{ flex: 1, fontSize: 12, padding: 6 }}
                  onClick={() =>
                    setSelectedIxIds(
                      ixOptions.map((ix) => ix.id).filter((id: any) => typeof id === "number")
                    )
                  }
                >
                  Select all
                </button>
                <button
                  type="button"
                  style={{ flex: 1, fontSize: 12, padding: 6 }}
                  onClick={() => setSelectedIxIds([])}
                >
                  None
                </button>
              </div>
              <div
                style={{
                  maxHeight: 150,
                  overflowY: "auto",
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: 6,
                  padding: 6,
                  marginBottom: 12,
                  background: theme.cardBg,
                }}
              >
                {ixOptions.map((ix) => (
                  <label key={ix.id} style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                    <input
                      type="checkbox"
                      checked={selectedIxIds.includes(ix.id)}
                      onChange={() => toggleIxSelection(ix.id)}
                      style={{ accentColor: "#22c55e" }}
                    />{" "}
                    {ix.name}
                  </label>
                ))}
                {ixOptions.length === 0 && (
                  <div style={{ fontSize: 12, color: theme.textMuted }}>No IX match.</div>
                )}
              </div>

              {/* Facility filter */}
              <div style={{ marginTop: 4, marginBottom: 4, fontWeight: 700 }}>Facility columns</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
                Filter by name, then select/deselect.
              </div>
              <input
                style={{
                  width: "100%",
                  padding: 6,
                  background: theme.cardBg,
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: 6,
                  color: theme.textPrimary,
                  marginBottom: 4,
                }}
                placeholder="Search facility name…"
                value={facSearch}
                onChange={(e) => setFacSearch(e.target.value)}
              />
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <button
                  type="button"
                  style={{ flex: 1, fontSize: 12, padding: 6 }}
                  onClick={() =>
                    setSelectedFacIds(
                      facOptions.map((fac) => fac.id).filter((id: any) => typeof id === "number")
                    )
                  }
                >
                  Select all
                </button>
                <button
                  type="button"
                  style={{ flex: 1, fontSize: 12, padding: 6 }}
                  onClick={() => setSelectedFacIds([])}
                >
                  None
                </button>
              </div>
              <div
                style={{
                  maxHeight: 150,
                  overflowY: "auto",
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: 6,
                  padding: 6,
                  background: theme.cardBg,
                }}
              >
                {facOptions.map((fac) => (
                  <label key={fac.id} style={{ display: "block", fontSize: 12, marginBottom: 2 }}>
                    <input
                      type="checkbox"
                      checked={selectedFacIds.includes(fac.id)}
                      onChange={() => toggleFacSelection(fac.id)}
                      style={{ accentColor: "#22c55e" }}
                    />{" "}
                    {fac.name}
                  </label>
                ))}
                {facOptions.length === 0 && (
                  <div style={{ fontSize: 12, color: theme.textMuted }}>No facility match.</div>
                )}
              </div>
            </>
          )}
        </aside>

        {/* MAIN CONTENT */}
        <section
          style={{
            flex: 1,
            padding: 12,
            overflow: "auto",
            fontSize: 14,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* PER-METRO SUMMARY CARDS */}
          {metroSummaries.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "nowrap",
                gap: 12,
                overflowX: "auto",
                paddingBottom: 4,
              }}
            >
              {metroSummaries.map((s) => {
                const cfg = METROS[s.key];
                return (
                  <div
                    key={s.key}
                    style={{
                      minWidth: 210,
                      padding: 10,
                      borderRadius: 12,
                      background: theme.metroCardBg,
                      border: `2px solid ${theme.metroCardBorder}`,
                      boxShadow: "0 8px 22px rgba(0,0,0,0.45)",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        height: 3,
                        width: "100%",
                        borderRadius: "12px 12px 0 0",
                        background:
                          "linear-gradient(90deg, #22c55e 0%, #3b82f6 40%, #a855f7 100%)",
                      }}
                    />
                    <div
                      style={{
                        fontSize: 11,
                        textTransform: "uppercase",
                        color: theme.textMuted,
                        marginTop: 6,
                        marginBottom: 2,
                      }}
                    >
                      {cfg.city}, {cfg.country}
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        marginBottom: 4,
                        color: theme.capacityAccentSoft,
                      }}
                    >
                      {formatCapacity(s.totalGbps)}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        color: theme.successAccentSoft,
                        fontWeight: 600,
                      }}
                    >
                      {formatCount(s.uniqueNets)} unique networks
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeView === "insights" && lastLoadedMetros.length > 0 && (
            <>
              <div
                style={{
                  padding: 16,
                  background: theme.cardBg,
                  borderRadius: 10,
                  border: `1px solid ${theme.cardBorder}`,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
                }}
              >
                <div style={{ fontSize: 12, color: theme.textMuted, textTransform: "uppercase" }}>
                  Insights builder
                </div>
                <h3 style={{ margin: "4px 0 8px", fontSize: 22 }}>Build a chart from the loaded metro data</h3>
                <div style={{ fontSize: 14, color: theme.textSecondary, lineHeight: 1.6, marginBottom: 14 }}>
                  Start from a question, then we can fine-tune the chart underneath. We still keep the
                  data-model power, but the first step should feel much more human than `dataset` and `series`.
                </div>

                <div
                  style={{
                    marginBottom: 16,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  {insightTemplateOptions.map((template) => {
                    const selected = selectedInsightTemplate === template.key;
                    return (
                      <button
                        key={`insight-template-${template.key}`}
                        type="button"
                        onClick={() => applyInsightTemplate(template.key)}
                        style={{
                          textAlign: "left",
                          padding: 14,
                          borderRadius: 12,
                          border: `1px solid ${selected ? theme.capacityAccent : theme.cardBorder}`,
                          background: selected ? "rgba(8, 47, 73, 0.32)" : "#020617",
                          color: theme.textPrimary,
                          cursor: "pointer",
                          boxShadow: selected ? "0 0 0 1px rgba(56, 189, 248, 0.18)" : "none",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{template.label}</div>
                        <div style={{ color: theme.textSecondary, lineHeight: 1.5, fontSize: 13 }}>
                          {template.description}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ color: theme.textSecondary, lineHeight: 1.6, marginBottom: 12 }}>{insightBuilderSummary}</div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                  <label>
                    <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Analyze</div>
                    <select
                      value={insightDataset}
                      onChange={(e) => setInsightDataset(e.target.value as InsightsDataset)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: "#020617",
                        color: theme.textPrimary,
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 10,
                        fontSize: 14,
                      }}
                    >
                      {Object.values(insightDatasets).map((dataset) => (
                        <option key={`insight-dataset-${dataset.key}`} value={dataset.key}>
                          {dataset.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Show as</div>
                    <select
                      value={insightChartType}
                      onChange={(e) => setInsightChartType(e.target.value as InsightsChartType)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: "#020617",
                        color: theme.textPrimary,
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 10,
                        fontSize: 14,
                      }}
                    >
                      <option value="bar">Bar</option>
                      <option value="stacked_bar">Stacked bar</option>
                      <option value="heatmap">Heatmap</option>
                      <option value="table">Table</option>
                    </select>
                  </label>

                  <label style={{ minWidth: 180 }}>
                    <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Group by</div>
                    <select
                      value={insightCategoryField}
                      onChange={(e) => setInsightCategoryField(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: "#020617",
                        color: theme.textPrimary,
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 10,
                        fontSize: 14,
                      }}
                    >
                      {activeInsightDataset.dimensions.map((field) => (
                        <option key={`insight-dimension-${field.key}`} value={field.key}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ minWidth: 180 }}>
                    <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Measure</div>
                    <select
                      value={insightMetricKey}
                      onChange={(e) => setInsightMetricKey(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: "#020617",
                        color: theme.textPrimary,
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 10,
                        fontSize: 14,
                      }}
                    >
                      {activeInsightDataset.metrics.map((metric) => (
                        <option key={`insight-metric-${metric.key}`} value={metric.key}>
                          {metric.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {(insightChartType === "stacked_bar" || insightChartType === "heatmap") && (
                    <label style={{ minWidth: 200 }}>
                      <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>
                        {insightChartType === "heatmap" ? "Columns" : "Split by"}
                      </div>
                      <select
                        value={insightSeriesField}
                        onChange={(e) => setInsightSeriesField(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          background: "#020617",
                          color: theme.textPrimary,
                          border: `1px solid ${theme.cardBorder}`,
                          borderRadius: 10,
                          fontSize: 14,
                        }}
                        disabled={activeInsightDataset.seriesOptions.length === 0}
                      >
                        <option value="none">No split</option>
                        {availableInsightSeriesOptions.map((option) => (
                          <option key={`insight-series-${option.key}`} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setShowInsightChartOptions((prev) => !prev)}
                    style={{
                      border: `1px solid ${theme.cardBorder}`,
                      borderRadius: 9999,
                      padding: "8px 12px",
                      background: showInsightChartOptions ? "#1e293b" : "#0f172a",
                      color: theme.textPrimary,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {showInsightChartOptions ? "Hide chart options" : "Show chart options"}
                  </button>
                </div>

                {showInsightChartOptions && (
                  <div
                    style={{
                      marginTop: 14,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 14,
                    }}
                  >
                    <label style={{ minWidth: 140 }}>
                      <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Sort by</div>
                      <select
                        value={insightSortBy}
                        onChange={(e) => setInsightSortBy(e.target.value as "metric" | "category")}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          background: "#020617",
                          color: theme.textPrimary,
                          border: `1px solid ${theme.cardBorder}`,
                          borderRadius: 10,
                          fontSize: 14,
                        }}
                      >
                        <option value="metric">Measure</option>
                        <option value="category">Group label</option>
                      </select>
                    </label>

                    <label style={{ minWidth: 140 }}>
                      <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Order</div>
                      <select
                        value={insightSortDirection}
                        onChange={(e) => setInsightSortDirection(e.target.value as "asc" | "desc")}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          background: "#020617",
                          color: theme.textPrimary,
                          border: `1px solid ${theme.cardBorder}`,
                          borderRadius: 10,
                          fontSize: 14,
                        }}
                      >
                        <option value="desc">Descending</option>
                        <option value="asc">Ascending</option>
                      </select>
                    </label>

                    <label style={{ minWidth: 140 }}>
                      <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Show top</div>
                      <select
                        value={String(insightTopN)}
                        onChange={(e) => setInsightTopN(Number(e.target.value))}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          background: "#020617",
                          color: theme.textPrimary,
                          border: `1px solid ${theme.cardBorder}`,
                          borderRadius: 10,
                          fontSize: 14,
                        }}
                      >
                        <option value="10">Top 10</option>
                        <option value="20">Top 20</option>
                        <option value="50">Top 50</option>
                        <option value="100">Top 100</option>
                        <option value="0">All</option>
                      </select>
                    </label>

                    {(insightChartType === "bar" || insightChartType === "stacked_bar") && (
                      <label style={{ minWidth: 140 }}>
                        <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Scale</div>
                        <select
                          value={insightValueScale}
                          onChange={(e) => setInsightValueScale(e.target.value as InsightValueScale)}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            background: "#020617",
                            color: theme.textPrimary,
                            border: `1px solid ${theme.cardBorder}`,
                            borderRadius: 10,
                            fontSize: 14,
                          }}
                        >
                          <option value="auto">Auto</option>
                          <option value="linear">Linear</option>
                          <option value="log">Log</option>
                        </select>
                      </label>
                    )}
                  </div>
                )}

                {insightRecommendation && insightRecommendation.chartType !== insightChartType && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 12,
                      borderRadius: 10,
                      border: `1px solid #38bdf8`,
                      background: "rgba(8, 47, 73, 0.28)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{insightRecommendation.title}</div>
                      <div style={{ color: theme.textSecondary, lineHeight: 1.5 }}>{insightRecommendation.description}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyInsightGuidanceAction(insightRecommendation.action)}
                      style={{
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 9999,
                        padding: "8px 12px",
                        background: "#0f172a",
                        color: theme.textPrimary,
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Apply recommendation
                    </button>
                  </div>
                )}

                <div
                  style={{
                    marginTop: 16,
                    padding: 12,
                    borderRadius: 10,
                    border: `1px solid ${theme.cardBorder}`,
                    background: "#020617",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontSize: 13, color: theme.textSecondary }}>
                      {activeInsightDataset.label}: {activeInsightDataset.description}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setShowInsightFilters((prev) => !prev)}
                        style={{
                          border: `1px solid ${theme.cardBorder}`,
                          borderRadius: 9999,
                          padding: "8px 12px",
                          background: showInsightFilters ? "#082f49" : "#0f172a",
                          color: showInsightFilters ? "#bae6fd" : theme.textPrimary,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {showInsightFilters ? "Hide filters" : "Show filters"}
                      </button>
                      <button
                        type="button"
                        onClick={clearInsightFilters}
                        style={{
                          border: `1px solid ${theme.cardBorder}`,
                          borderRadius: 9999,
                          padding: "8px 12px",
                          background: "#0f172a",
                          color: theme.textPrimary,
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  </div>

                  {showInsightFilters && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
                      <label>
                        <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Search</div>
                        <input
                          value={insightSearchText}
                          onChange={(e) => setInsightSearchText(e.target.value)}
                          placeholder="Search network, ASN, metro, IX, facility..."
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            background: "#0b1120",
                            color: theme.textPrimary,
                            border: `1px solid ${theme.cardBorder}`,
                            borderRadius: 10,
                            fontSize: 14,
                          }}
                        />
                      </label>

                      <div>
                        <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Metros</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {insightMetroOptions.map((metro) => {
                            const selected = insightMetroFilter.includes(metro);
                            return (
                              <button
                                key={`insight-metro-filter-${metro}`}
                                type="button"
                                onClick={() => toggleInsightMetroFilter(metro)}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 9999,
                                  border: `1px solid ${selected ? "#38bdf8" : theme.cardBorder}`,
                                  background: selected ? "#082f49" : "#0b1120",
                                  color: selected ? "#bae6fd" : theme.textPrimary,
                                  cursor: "pointer",
                                  fontSize: 13,
                                }}
                              >
                                {metro}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {(insightNetworkTypeOptions.length > 0 ||
                        insightOriginCountryOptions.length > 0 ||
                        insightPresenceTypeOptions.length > 0) && (
                        <div
                          style={{
                            borderTop: `1px solid ${theme.gridBorder}`,
                            paddingTop: 12,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setShowInsightAdvancedFilters((prev) => !prev)}
                            style={{
                              border: `1px solid ${theme.cardBorder}`,
                              borderRadius: 9999,
                              padding: "8px 12px",
                              background: showInsightAdvancedFilters ? "#1e293b" : "#0f172a",
                              color: theme.textPrimary,
                              cursor: "pointer",
                              fontSize: 13,
                              fontWeight: 600,
                              marginBottom: showInsightAdvancedFilters ? 12 : 0,
                            }}
                          >
                            {showInsightAdvancedFilters ? "Hide advanced filters" : "Show advanced filters"}
                          </button>

                          {showInsightAdvancedFilters && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                              {insightNetworkTypeOptions.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Network type</div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                    {insightNetworkTypeOptions.map((value) => {
                                      const selected = insightNetworkTypeFilter.includes(value);
                                      return (
                                        <button
                                          key={`insight-network-type-${value}`}
                                          type="button"
                                          onClick={() => toggleInsightStringFilter(value, setInsightNetworkTypeFilter)}
                                          style={{
                                            padding: "6px 10px",
                                            borderRadius: 9999,
                                            border: `1px solid ${selected ? "#22c55e" : theme.cardBorder}`,
                                            background: selected ? "#072d1f" : "#0b1120",
                                            color: selected ? "#bbf7d0" : theme.textPrimary,
                                            cursor: "pointer",
                                            fontSize: 13,
                                          }}
                                        >
                                          {value}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {insightOriginCountryOptions.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Origin country</div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                    {insightOriginCountryOptions.map((value) => {
                                      const selected = insightOriginCountryFilter.includes(value);
                                      return (
                                        <button
                                          key={`insight-origin-country-${value}`}
                                          type="button"
                                          onClick={() => toggleInsightStringFilter(value, setInsightOriginCountryFilter)}
                                          style={{
                                            padding: "6px 10px",
                                            borderRadius: 9999,
                                            border: `1px solid ${selected ? "#a855f7" : theme.cardBorder}`,
                                            background: selected ? "#2e1065" : "#0b1120",
                                            color: selected ? "#ddd6fe" : theme.textPrimary,
                                            cursor: "pointer",
                                            fontSize: 13,
                                          }}
                                        >
                                          {value}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {insightPresenceTypeOptions.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 6 }}>Presence type</div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                    {insightPresenceTypeOptions.map((value) => {
                                      const selected = insightPresenceTypeFilter.includes(value);
                                      return (
                                        <button
                                          key={`insight-presence-type-${value}`}
                                          type="button"
                                          onClick={() => toggleInsightStringFilter(value, setInsightPresenceTypeFilter)}
                                          style={{
                                            padding: "6px 10px",
                                            borderRadius: 9999,
                                            border: `1px solid ${selected ? "#f59e0b" : theme.cardBorder}`,
                                            background: selected ? "#451a03" : "#0b1120",
                                            color: selected ? "#fde68a" : theme.textPrimary,
                                            cursor: "pointer",
                                            fontSize: 13,
                                          }}
                                        >
                                          {value}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  background: theme.cardBg,
                  borderRadius: 10,
                  border: `1px solid ${theme.cardBorder}`,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
                }}
              >
                <div style={{ fontSize: 12, color: theme.textMuted, textTransform: "uppercase" }}>Chart preview</div>
                <h3 style={{ margin: "4px 0 8px", fontSize: 22 }}>Generated result</h3>
                <div style={{ fontSize: 14, color: theme.textSecondary, lineHeight: 1.6, marginBottom: 14 }}>
                  Choose a data grain, then build the view you want. Underneath the chart, we also show
                  the filtered raw rows driving the result.
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                  <span style={metricChipStyle("capacity")}>
                    {formatCount(filteredInsightRows.length)} filtered rows
                  </span>
                  {insightChartType !== "table" && (
                    <span style={metricChipStyle(activeInsightMetricOption.format === "capacity" ? "capacity" : "facility")}>
                      {formatCount(insightChartData.rows.length)} chart categories
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleDownloadInsightRowsCsv}
                    style={{
                      border: `1px solid ${theme.cardBorder}`,
                      borderRadius: 9999,
                      padding: "6px 10px",
                      background: "#0f172a",
                      color: theme.textPrimary,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    Export filtered rows CSV
                  </button>
                  {insightChartType !== "table" && insightChartData.rows.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadInsightChartCsv}
                      style={{
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 9999,
                        padding: "6px 10px",
                        background: "#0f172a",
                        color: theme.textPrimary,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      Export chart CSV
                    </button>
                  )}
                </div>

                {insightGuidance && (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: 14,
                      borderRadius: 12,
                      border: `1px solid ${
                        insightGuidance.tone === "warning" ? "#f59e0b" : "#38bdf8"
                      }`,
                      background: insightGuidance.tone === "warning" ? "rgba(120, 53, 15, 0.22)" : "rgba(8, 47, 73, 0.28)",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{insightGuidance.title}</div>
                    <div style={{ color: theme.textSecondary, lineHeight: 1.6, marginBottom: 12 }}>
                      {insightGuidance.description}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {insightGuidance.actions.map((action) => {
                        const labelMap: Record<InsightGuidanceAction, string> = {
                          switch_to_table: "Switch to table",
                          switch_to_bar: "Switch to bar",
                          switch_to_stacked_bar: "Switch to stacked bar",
                          switch_to_heatmap: "Switch to heatmap",
                          set_category_network_name: "Use network name as rows",
                          set_category_origin_country: "Use origin country as rows",
                          set_series_ix: "Split by IX",
                          set_series_metro: "Use metro as columns",
                          clear_metro_filter: "Clear metro filter",
                          clear_all_filters: "Clear all filters",
                        };
                        return (
                          <button
                            key={`insight-guidance-${action}`}
                            type="button"
                            onClick={() => applyInsightGuidanceAction(action)}
                            style={{
                              border: `1px solid ${theme.cardBorder}`,
                              borderRadius: 9999,
                              padding: "8px 12px",
                              background: "#0f172a",
                              color: theme.textPrimary,
                              cursor: "pointer",
                              fontSize: 13,
                              fontWeight: 600,
                            }}
                          >
                            {labelMap[action]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(insightChartType !== "table" && insightChartData.rows.length === 0) || filteredInsightRows.length === 0 ? (
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 10,
                      border: `1px dashed ${theme.cardBorder}`,
                      color: theme.textMuted,
                    }}
                  >
                    No chartable data is available for the current settings yet.
                  </div>
                ) : (
                  <>
                    {((insightChartType === "stacked_bar" && insightChartData.seriesLabels.length > 1) ||
                      (insightChartType === "heatmap" && insightChartData.seriesLabels.length > 1)) && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 10,
                          marginBottom: 14,
                          padding: 10,
                          borderRadius: 10,
                          border: `1px solid ${theme.cardBorder}`,
                          background: "#020617",
                        }}
                      >
                        {insightChartData.seriesLabels.map((label) => (
                          <div
                            key={`insight-legend-${label}`}
                            style={{ display: "flex", alignItems: "center", gap: 6, color: theme.textSecondary }}
                          >
                            <span
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: 3,
                                background: insightChartData.seriesColorMap[label],
                                border: `1px solid ${theme.gridBorder}`,
                              }}
                            />
                            <span>{label}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {insightChartType === "heatmap" ? (
                      <div
                        style={{
                          overflowX: "auto",
                          borderRadius: 10,
                          border: `1px solid ${theme.cardBorder}`,
                          background: "#020617",
                        }}
                      >
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: "left", padding: "10px 12px", color: theme.textPrimary }}>
                                {insightFieldLabelMap[insightCategoryField] || insightCategoryField}
                              </th>
                              {insightChartData.seriesLabels.map((label) => (
                                <th
                                  key={`heatmap-header-${label}`}
                                  style={{ textAlign: "left", padding: "10px 12px", color: theme.textPrimary }}
                                >
                                  {label}
                                </th>
                              ))}
                              <th style={{ textAlign: "left", padding: "10px 12px", color: theme.textPrimary }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {insightHeatmapRows.map((row) => (
                              <tr key={`heatmap-row-${row.label}`}>
                                <td style={{ padding: "10px 12px", borderTop: `1px solid ${theme.gridBorder}` }}>
                                  {row.label}
                                </td>
                                {insightChartData.seriesLabels.map((label) => {
                                  const value = row.values[label] ?? 0;
                                  const intensity = maxInsightHeatmapValue > 0 ? value / maxInsightHeatmapValue : 0;
                                  return (
                                    <td
                                      key={`heatmap-cell-${row.label}-${label}`}
                                      style={{
                                        padding: "10px 12px",
                                        borderTop: `1px solid ${theme.gridBorder}`,
                                      }}
                                    >
                                      <HoverCard
                                        width={260}
                                        label={
                                          <div
                                            style={{
                                              borderRadius: 8,
                                              padding: "8px 10px",
                                              background: `rgba(56, 189, 248, ${Math.max(0.12, intensity * 0.7)})`,
                                              border: `1px solid rgba(56, 189, 248, ${Math.max(0.25, intensity)})`,
                                              color: theme.textPrimary,
                                            }}
                                          >
                                            {insightMetricFormatter(value)}
                                          </div>
                                        }
                                      >
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{row.label}</div>
                                        <div style={{ color: theme.textSecondary, marginBottom: 4 }}>{label}</div>
                                        <strong>{insightMetricFormatter(value)}</strong>
                                      </HoverCard>
                                    </td>
                                  );
                                })}
                                <td style={{ padding: "10px 12px", borderTop: `1px solid ${theme.gridBorder}` }}>
                                  <strong>{insightMetricFormatter(row.total)}</strong>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : insightChartType !== "table" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {(insightChartType === "bar" || insightChartType === "stacked_bar") && (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              flexWrap: "wrap",
                              alignItems: "center",
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: `1px solid ${theme.cardBorder}`,
                              background: "#020617",
                            }}
                          >
                            <div style={{ color: theme.textSecondary, lineHeight: 1.5 }}>
                              {insightEffectiveScale === "log"
                                ? `Using log scale because the spread is about ${formatCount(
                                    Math.round(insightValueSpread)
                                  )}x between the smallest and largest values.`
                                : "Using linear scale because the values are in a comparable range."}
                            </div>
                            <span
                              style={{
                                borderRadius: 9999,
                                border: `1px solid ${theme.cardBorder}`,
                                padding: "6px 10px",
                                background: "#0f172a",
                                color: theme.textPrimary,
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              {insightValueScale === "auto"
                                ? `Auto-selected ${insightEffectiveScale} scale`
                                : `${insightEffectiveScale === "log" ? "Log" : "Linear"} scale`}
                            </span>
                          </div>
                        )}

                        {insightChartData.rows.map((row) => {
                          const totalWidthPct = getInsightScaledFraction(row.total) * 100;
                          const segments =
                            insightChartType === "bar"
                              ? [
                                  {
                                    key: "total",
                                    label: activeInsightMetricOption.label,
                                    value: row.total,
                                  },
                                ]
                              : row.segments;

                          return (
                            <div key={`insight-row-${row.label}`}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  marginBottom: 8,
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                }}
                              >
                                <strong style={{ fontSize: 18 }}>{row.label}</strong>
                                <HoverCard
                                  width={320}
                                  label={
                                    <span
                                      style={metricChipStyle(
                                        activeInsightMetricOption.format === "capacity" ? "capacity" : "facility"
                                      )}
                                    >
                                      {insightMetricFormatter(row.total)}
                                    </span>
                                  }
                                >
                                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{row.label}</div>
                                  <div style={{ color: theme.textSecondary, marginBottom: 8 }}>
                                    Total: {insightMetricFormatter(row.total)}
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {segments.map((segment) => (
                                      <div
                                        key={`insight-pop-${row.label}-${segment.key}`}
                                        style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
                                      >
                                        <span style={{ color: theme.textSecondary }}>{segment.label}</span>
                                        <strong>{insightMetricFormatter(segment.value)}</strong>
                                      </div>
                                    ))}
                                  </div>
                                </HoverCard>
                              </div>

                              <div
                                style={{
                                  position: "relative",
                                  height: 36,
                                  width: "100%",
                                  borderRadius: 9999,
                                  overflow: "hidden",
                                  border: `1px solid ${theme.gridBorder}`,
                                  background: "#020617",
                                }}
                              >
                                {insightAxisTicks.map((tick) => (
                                  <div
                                    key={`insight-grid-${row.label}-${tick.value}`}
                                    style={{
                                      position: "absolute",
                                      left: `${tick.leftPct}%`,
                                      top: 0,
                                      bottom: 0,
                                      width: 1,
                                      background: "rgba(148, 163, 184, 0.18)",
                                      zIndex: 0,
                                    }}
                                  />
                                ))}

                                <div
                                  style={{
                                    position: "relative",
                                    zIndex: 1,
                                    height: "100%",
                                    width: `${Math.max(totalWidthPct, row.total > 0 ? 1.25 : 0)}%`,
                                    minWidth: row.total > 0 ? 8 : 0,
                                    display: "flex",
                                    gap: insightChartType === "bar" ? 0 : 2,
                                  }}
                                >
                                  {segments.map((segment) => {
                                    const segmentWidth = row.total > 0 ? (segment.value / row.total) * 100 : 0;
                                    return (
                                      <HoverCard
                                        key={`insight-segment-${row.label}-${segment.key}`}
                                        width={280}
                                        wrapperStyle={{
                                          display: "block",
                                          width: `${Math.max(segmentWidth, 1)}%`,
                                          minWidth: segmentWidth > 0 ? 10 : 0,
                                          height: "100%",
                                        }}
                                        triggerStyle={{ display: "block", width: "100%", height: "100%" }}
                                        label={
                                          <div
                                            style={{
                                              width: "100%",
                                              background:
                                                insightChartType === "bar"
                                                  ? "linear-gradient(90deg, #0ea5e9 0%, #38bdf8 100%)"
                                                  : insightChartData.seriesColorMap[segment.label],
                                              borderRight: `1px solid ${theme.gridBorder}`,
                                              height: "100%",
                                              boxShadow:
                                                insightChartType === "bar"
                                                  ? "inset 0 0 0 1px rgba(186, 230, 253, 0.25), 0 0 12px rgba(14, 165, 233, 0.25)"
                                                  : undefined,
                                            }}
                                          />
                                        }
                                      >
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{segment.label}</div>
                                        <div style={{ color: theme.textSecondary, marginBottom: 4 }}>{row.label}</div>
                                        <strong>{insightMetricFormatter(segment.value)}</strong>
                                      </HoverCard>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {(insightChartType === "bar" || insightChartType === "stacked_bar") && insightAxisTicks.length > 0 && (
                          <div style={{ position: "relative", height: 30, marginTop: -4 }}>
                            {insightAxisTicks.map((tick) => (
                              <div
                                key={`insight-axis-label-${tick.value}`}
                                style={{
                                  position: "absolute",
                                  left: `${tick.leftPct}%`,
                                  transform: "translateX(-50%)",
                                  fontSize: 12,
                                  color: theme.textMuted,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {tick.label}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div
                      style={{
                        marginTop: 18,
                        borderRadius: 10,
                        border: `1px solid ${theme.cardBorder}`,
                        background: "#020617",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "12px 14px",
                          borderBottom: `1px solid ${theme.cardBorder}`,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 12, color: theme.textMuted, textTransform: "uppercase" }}>
                            Underlying data
                          </div>
                          <div style={{ marginTop: 4, color: theme.textSecondary }}>
                            Showing {formatCount(insightTableRows.length)} of {formatCount(filteredInsightRows.length)} filtered rows.
                          </div>
                        </div>
                      </div>

                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
                          <thead>
                            <tr>
                              {activeInsightDataset.tableFields.map((field) => (
                                <th
                                  key={`insight-table-head-${field.key}`}
                                  style={{
                                    textAlign: "left",
                                    padding: "10px 12px",
                                    color: theme.textPrimary,
                                    borderBottom: `1px solid ${theme.cardBorder}`,
                                    fontSize: 13,
                                    position: "sticky",
                                    top: 0,
                                    background: "#020617",
                                  }}
                                >
                                  {field.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {insightTableRows.map((row) => (
                              <tr key={`insight-table-row-${row.row_id}`}>
                                {activeInsightDataset.tableFields.map((field) => (
                                  <td
                                    key={`insight-table-cell-${row.row_id}-${field.key}`}
                                    style={{
                                      padding: "10px 12px",
                                      borderBottom: `1px solid ${theme.gridBorder}`,
                                      color: theme.textSoft,
                                      fontSize: 14,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {formatInsightCell(field.key, row[field.key])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {activeView === "compare" && metroCompareSummaries.length > 0 && (
            <>
              <div
                style={{
                  padding: 14,
                  background: theme.cardBg,
                  borderRadius: 10,
                  border: `1px solid ${theme.cardBorder}`,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
                }}
              >
                <div style={{ fontSize: 11, color: theme.textMuted, textTransform: "uppercase" }}>
                  Compare view
                </div>
                <h3 style={{ margin: "2px 0 6px" }}>Metro comparison – deployed capacity and presence</h3>
                <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>
                  This view compares the currently loaded metros. Capacity is summed across all IXs in
                  each metro. Presence counts every network-to-facility/DC relationship across the metro.
                </div>
              </div>

              <div
                style={{
                  padding: 14,
                  background: theme.cardBg,
                  borderRadius: 10,
                  border: `1px solid ${theme.cardBorder}`,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
                }}
              >
                <div style={{ fontSize: 11, color: theme.textMuted, textTransform: "uppercase" }}>
                  Explorer
                </div>
                <h3 style={{ margin: "2px 0 10px" }}>Presence gaps by selected metro</h3>
                <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
                  Use this to identify networks that are present in some metros but missing in others.
                  A network counts as present if it appears via IX capacity, facility presence, or both.
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "flex-end",
                    marginBottom: 12,
                  }}
                >
                  <label style={{ minWidth: 240 }}>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
                      Explore networks
                    </div>
                    <select
                      value={gapFilterMode}
                      onChange={(e) => setGapFilterMode(e.target.value as GapFilterMode)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: "#020617",
                        color: theme.textPrimary,
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 8,
                      }}
                    >
                      <option value="present_in_source_not_target">Present in one metro, missing from another</option>
                      <option value="missing_somewhere">Present in some selected metros, missing in others</option>
                      <option value="only_one_metro">Only in one selected metro</option>
                      <option value="present_in_all">Present in all selected metros</option>
                      <option value="all">Show all loaded networks</option>
                    </select>
                  </label>

                  {lastLoadedMetros.length > 0 && (
                    <div style={{ minWidth: 280, flex: "1 1 320px" }}>
                      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>
                        Present in
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {lastLoadedMetros.map((metro) => (
                          <label
                            key={`gap-source-${metro}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "5px 10px",
                              borderRadius: 9999,
                              border: `1px solid ${gapSourceMetros.includes(metro) ? "#22c55e" : theme.cardBorder}`,
                              background: "#020617",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={gapSourceMetros.includes(metro)}
                              onChange={() => toggleGapSourceMetro(metro)}
                              style={{ accentColor: "#22c55e" }}
                            />
                            <span>{metro}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {lastLoadedMetros.length > 1 && (
                    <div style={{ minWidth: 280, flex: "1 1 320px", opacity: gapFilterMode === "present_in_source_not_target" ? 1 : 0.65 }}>
                      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>
                        Compare against
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {lastLoadedMetros
                          .filter((metro) => !gapSourceMetros.includes(metro))
                          .map((metro) => (
                            <label
                              key={`gap-target-${metro}`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "5px 10px",
                                borderRadius: 9999,
                                border: `1px solid ${gapTargetMetros.includes(metro) ? "#38bdf8" : theme.cardBorder}`,
                                background: "#020617",
                                cursor:
                                  gapFilterMode === "present_in_source_not_target" ? "pointer" : "not-allowed",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={gapTargetMetros.includes(metro)}
                                onChange={() => {
                                  if (gapFilterMode === "present_in_source_not_target") {
                                    toggleGapTargetMetro(metro);
                                  }
                                }}
                                disabled={gapFilterMode !== "present_in_source_not_target"}
                                style={{ accentColor: "#38bdf8" }}
                              />
                              <span>{metro}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  )}

                  <label style={{ minWidth: 240 }}>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
                      Filter networks
                    </div>
                    <input
                      value={gapNetworkFilterText}
                      onChange={(e) => setGapNetworkFilterText(e.target.value)}
                      placeholder="Multiple ASNs or names, e.g. 13335 google cloudflare"
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: "#020617",
                        color: theme.textPrimary,
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 8,
                      }}
                    />
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
                      Multiple terms are supported and matched as an OR filter.
                    </div>
                  </label>

                  <label style={{ minWidth: 180 }}>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
                      Sort by
                    </div>
                    <select
                      value={gapSortField}
                      onChange={(e) => setGapSortField(e.target.value as GapSortField)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: "#020617",
                        color: theme.textPrimary,
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 8,
                      }}
                    >
                      <option value="source_capacity">Capacity across selected “Present in” metros</option>
                      <option value="source_facility_presence">Facility presences across selected “Present in” metros</option>
                      <option value="present_count">Number of selected metros present</option>
                      <option value="asn">ASN</option>
                      <option value="name">Network name</option>
                    </select>
                  </label>

                  <label style={{ minWidth: 160 }}>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
                      Order
                    </div>
                    <select
                      value={gapSortDirection}
                      onChange={(e) => setGapSortDirection(e.target.value as "asc" | "desc")}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: "#020617",
                        color: theme.textPrimary,
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 8,
                      }}
                    >
                      <option value="desc">Descending</option>
                      <option value="asc">Ascending</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={handleDownloadPresenceCsv}
                    style={{
                      fontSize: 12,
                      padding: "9px 12px",
                      borderRadius: 9999,
                      border: `1px solid ${theme.cardBorder}`,
                      background: theme.pillBg,
                      color: theme.textSoft,
                      cursor: presenceGapRows.length > 0 ? "pointer" : "not-allowed",
                      opacity: presenceGapRows.length > 0 ? 1 : 0.5,
                    }}
                    disabled={presenceGapRows.length === 0}
                  >
                    Download presence CSV
                  </button>
                </div>

                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10 }}>
                  Showing <strong style={{ color: theme.textPrimary }}>{formatCount(presenceGapRows.length)}</strong>{" "}
                  networks from the current loaded set.
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10 }}>
                  Tip: click any network row to open a metro-by-metro deep dive.
                </div>

                {presenceGapRows.length === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: theme.textMuted,
                      padding: 12,
                      borderRadius: 8,
                      border: `1px dashed ${theme.cardBorder}`,
                      background: "#020617",
                    }}
                  >
                    No networks match the current presence filter.
                  </div>
                ) : (
                  <div
                    style={{
                      maxHeight: 420,
                      overflow: "auto",
                      border: `1px solid ${theme.gridBorder}`,
                      borderRadius: 8,
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        minWidth: 280 + lastLoadedMetros.length * 190,
                        borderCollapse: "collapse",
                        fontSize: 13,
                      }}
                    >
                      <thead>
                        <tr>
                          <th style={{ ...headerCellBase, textAlign: "left", minWidth: 80 }}>ASN</th>
                          <th style={{ ...headerCellBase, textAlign: "left", minWidth: 220 }}>Network</th>
                          {lastLoadedMetros.map((metro) => (
                            <th
                              key={`gap-head-${metro}`}
                              style={{ ...headerCellBase, textAlign: "left", minWidth: 190 }}
                            >
                              {metro}
                            </th>
                          ))}
                          <th style={{ ...headerCellBase, textAlign: "left", minWidth: 220 }}>
                            Footprint
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {presenceGapRows.map((row, rowIndex) => (
                          <tr
                            key={`gap-row-${row.net.netId}`}
                            onClick={() => setSelectedGapNetId(row.net.netId)}
                            style={{
                              backgroundColor:
                                selectedGapNetId === row.net.netId
                                  ? theme.selectedRowBg
                                  : rowIndex % 2 === 0
                                    ? theme.tableRowAlt1
                                    : theme.tableRowAlt2,
                              borderBottom: `1px solid ${theme.gridBorder}`,
                              cursor: "pointer",
                              outline:
                                selectedGapNetId === row.net.netId ? "1px solid #38bdf8" : "none",
                            }}
                          >
                            <td style={{ ...bodyCellBase, fontWeight: 600 }}>
                              {row.net.asn ?? "?"}
                            </td>
                            <td
                              style={{
                                ...bodyCellBase,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: 220,
                              }}
                              title={row.net.name ?? ""}
                            >
                              {row.net.name ?? ""}
                            </td>
                            {lastLoadedMetros.map((metro) => {
                              const summary = row.metroStates[metro];
                              const label = presenceStatusLabel(summary);
                              const tone = presenceTone(summary);
                              const reason = describePresenceReason(row.net, metro, summary);
                              return (
                                <td key={`gap-cell-${row.net.netId}-${metro}`} style={bodyCellBase}>
                                  <div style={{ marginBottom: 6 }}>
                                    <HoverCard
                                      width={320}
                                      label={
                                        <span
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            borderRadius: 9999,
                                            padding: "4px 10px",
                                            fontSize: 13,
                                            fontWeight: 700,
                                            background: tone.background,
                                            color: tone.color,
                                            border: `1px solid ${tone.borderColor}`,
                                          }}
                                        >
                                          {label}
                                        </span>
                                      }
                                    >
                                      <div style={{ fontWeight: 700, marginBottom: 6 }}>{reason.title}</div>
                                      {reason.lines.map((line) => (
                                        <div key={`${reason.title}-${line}`} style={{ color: theme.textSecondary }}>
                                          {line}
                                        </div>
                                      ))}
                                    </HoverCard>
                                  </div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    <HoverCard
                                      width={340}
                                      label={<span style={metricChipStyle("capacity")}>{formatCapacity(summary?.capacityGbps ?? 0)}</span>}
                                    >
                                      <div style={{ fontWeight: 700, marginBottom: 6 }}>{metro} IX deployment</div>
                                      {reason.detail?.ixEntries?.length ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                          {reason.detail.ixEntries.map((ix) => (
                                            <div
                                              key={`hover-ix-${row.net.netId}-${metro}-${ix.id}`}
                                              style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
                                            >
                                              <span style={{ color: theme.textSecondary }}>{ix.name}</span>
                                              <strong>{formatCapacity(ix.capacityGbps)}</strong>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div style={{ color: theme.textSecondary }}>No IX deployment in this metro.</div>
                                      )}
                                    </HoverCard>
                                    <HoverCard
                                      width={340}
                                      label={<span style={metricChipStyle("facility")}>{formatCount(summary?.facilityPresenceCount || 0)} DCs</span>}
                                    >
                                      <div style={{ fontWeight: 700, marginBottom: 6 }}>{metro} facility/DC presence</div>
                                      {reason.detail?.facilityEntries?.length ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                          {reason.detail.facilityEntries.map((facility) => (
                                            <div
                                              key={`hover-fac-${row.net.netId}-${metro}-${facility.id}`}
                                              style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
                                            >
                                              <span style={{ color: theme.textSecondary }}>{facility.name}</span>
                                              <span style={{ color: theme.textMuted }}>{facility.city || "Metro facility"}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div style={{ color: theme.textSecondary }}>No facility presence in this metro.</div>
                                      )}
                                    </HoverCard>
                                  </div>
                                </td>
                              );
                            })}
                            <td style={{ ...bodyCellBase, color: theme.textMuted }}>
                              {row.metroFootprint.length > 0
                                ? row.metroFootprint.join(" | ")
                                : "Absent everywhere"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedGapRow ? (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      background: theme.cardBgElevated,
                      borderRadius: 10,
                      border: `1px solid ${theme.cardBorder}`,
                      boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 11, color: theme.textMuted, textTransform: "uppercase" }}>
                          Network deep dive
                        </div>
                        <h4 style={{ margin: "2px 0 8px", fontSize: 20 }}>
                          AS{selectedGapRow.net.asn ?? "?"} {selectedGapRow.net.name ?? ""}
                        </h4>
                        <div style={{ fontSize: 12, color: theme.textMuted }}>
                          Footprint:{" "}
                          {selectedGapRow.metroFootprint.length > 0
                            ? selectedGapRow.metroFootprint.join(" | ")
                            : "Absent in loaded metros"}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                          <span style={{ ...metricChipStyle("capacity"), background: "#0f172a", borderColor: theme.gridBorder }}>
                            {selectedGapRow.net.networkType || "Unknown type"}
                          </span>
                          <span style={{ ...metricChipStyle("facility"), background: "#0f172a", borderColor: theme.gridBorder }}>
                            Origin: {selectedGapRow.net.originCity ? `${selectedGapRow.net.originCity}, ` : ""}
                            {selectedGapRow.net.originCountry || "Unknown"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedGapNetId(null)}
                        style={{
                          fontSize: 12,
                          padding: "8px 12px",
                          borderRadius: 9999,
                          border: `1px solid ${theme.cardBorder}`,
                          background: theme.pillBg,
                          color: theme.textSoft,
                          cursor: "pointer",
                        }}
                      >
                        Close
                      </button>
                    </div>

                    <div
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: `1px solid ${theme.cardBorder}`,
                        background: "#040f1c",
                        marginBottom: 14,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: theme.capacityAccentSoft }}>
                        IX deployment across IXs for this network
                      </div>
                      <div style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 10 }}>
                        Each bar shows the chosen network’s deployed IX capacity within a metro, stacked by IX.
                        Mouse over a segment to see IX name and deployed capacity.
                      </div>
                      {selectedGapIxLegend.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 10,
                            marginBottom: 12,
                            fontSize: 12,
                          }}
                        >
                          {selectedGapIxLegend.map((ix) => (
                            <div
                              key={`detail-legend-${ix.id}`}
                              style={{ display: "flex", alignItems: "center", gap: 6 }}
                            >
                              <span
                                style={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: 3,
                                  background: ixColors[ix.id] || theme.ixAbsentFg,
                                  border: `1px solid ${theme.gridBorder}`,
                                }}
                              />
                              <span>{ix.name}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {selectedGapMetroDetails.map(({ metro, summary, ixEntries }) => {
                          const totalGbps = summary?.capacityGbps ?? 0;
                          const widthPct =
                            selectedGapMaxMetroCapacity > 0
                              ? (totalGbps / selectedGapMaxMetroCapacity) * 100
                              : 0;
                          return (
                            <div key={`detail-chart-${metro}`}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  marginBottom: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                <div>
                                  <strong>{metro}</strong>
                                  <span style={{ color: theme.textSecondary }}>
                                    {" "}
                                    • {formatCount(ixEntries.length)} IXs
                                  </span>
                                </div>
                                <div style={{ color: theme.capacityAccentSoft, fontWeight: 800 }}>
                                  {formatCapacity(totalGbps)}
                                </div>
                              </div>
                              <div
                                style={{
                                  height: 24,
                                  background: "#020617",
                                  border: `1px solid ${theme.gridBorder}`,
                                  borderRadius: 9999,
                                  overflow: "hidden",
                                  width: `${Math.max(widthPct, totalGbps > 0 ? 16 : 0)}%`,
                                  minWidth: totalGbps > 0 ? 140 : 0,
                                  display: "flex",
                                }}
                              >
                                {ixEntries.length === 0 ? (
                                  <div
                                    style={{
                                      width: "100%",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 12,
                                      color: theme.textSecondary,
                                    }}
                                  >
                                    No IX deployment
                                  </div>
                                ) : (
                                  ixEntries.map((ix) => {
                                    const segmentWidth = totalGbps > 0 ? (ix.capacityGbps / totalGbps) * 100 : 0;
                                    return (
                                      <div
                                        key={`detail-chart-segment-${metro}-${ix.id}`}
                                        title={`${metro} • ${ix.name}: ${formatCapacity(ix.capacityGbps)}`}
                                        style={{
                                          width: `${segmentWidth}%`,
                                          height: "100%",
                                          background: ixColors[ix.id] || theme.ixAbsentFg,
                                          borderRight: `1px solid ${theme.gridBorder}`,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: segmentWidth > 22 ? "center" : "flex-end",
                                          paddingRight: segmentWidth > 22 ? 0 : 4,
                                          fontSize: 11,
                                          fontWeight: 700,
                                          color: "#f8fafc",
                                          overflow: "hidden",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {segmentWidth > 22 ? formatCount(Math.round(ix.capacityGbps)) : ""}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                        gap: 12,
                      }}
                    >
                      {selectedGapMetroDetails.map(({ metro, summary, ixEntries, facilityEntries }) => (
                        <div
                          key={`detail-${metro}`}
                          style={{
                            padding: 12,
                            borderRadius: 10,
                            border: `1px solid ${theme.cardBorder}`,
                            background: "#040f1c",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 8,
                            }}
                          >
                            <strong>{metro}</strong>
                            <span
                              style={{
                                borderRadius: 9999,
                                padding: "3px 9px",
                                fontSize: 12,
                                fontWeight: 700,
                                ...presenceTone(summary),
                                border: `1px solid ${presenceTone(summary).borderColor}`,
                              }}
                            >
                              {presenceStatusLabel(summary)}
                            </span>
                          </div>

                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                            <HoverCard
                              width={340}
                              label={<span style={metricChipStyle("capacity")}>{formatCapacity(summary?.capacityGbps ?? 0)}</span>}
                            >
                              <div style={{ fontWeight: 700, marginBottom: 6 }}>{metro} IX deployment</div>
                              {ixEntries.length === 0 ? (
                                <div style={{ color: theme.textSecondary }}>No IX deployment in this metro.</div>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {ixEntries.map((ix) => (
                                    <div
                                      key={`deep-hover-ix-${metro}-${ix.id}`}
                                      style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
                                    >
                                      <span style={{ color: theme.textSecondary }}>{ix.name}</span>
                                      <strong>{formatCapacity(ix.capacityGbps)}</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </HoverCard>
                            <HoverCard
                              width={340}
                              label={<span style={metricChipStyle("facility")}>{formatCount(summary?.facilityPresenceCount || 0)} DCs</span>}
                            >
                              <div style={{ fontWeight: 700, marginBottom: 6 }}>{metro} facility/DC presence</div>
                              {facilityEntries.length === 0 ? (
                                <div style={{ color: theme.textSecondary }}>No facility presence in this metro.</div>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {facilityEntries.map((facility) => (
                                    <div
                                      key={`deep-hover-fac-${metro}-${facility.id}`}
                                      style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
                                    >
                                      <span style={{ color: theme.textSecondary }}>{facility.name}</span>
                                      <span style={{ color: theme.textMuted }}>{facility.city || "Metro facility"}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </HoverCard>
                          </div>

                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: theme.capacityAccentSoft }}>
                              IX capacity breakdown
                            </div>
                            {ixEntries.length === 0 ? (
                              <div style={{ fontSize: 12, color: theme.textSecondary }}>No IX presence</div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {ixEntries.map((ix) => (
                                  <div
                                    key={`ix-detail-${metro}-${ix.id}`}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: 8,
                                      fontSize: 12,
                                    }}
                                  >
                                    <span style={{ color: theme.textSecondary }}>{ix.name}</span>
                                    <strong style={{ color: theme.capacityAccentSoft }}>{formatCapacity(ix.capacityGbps)}</strong>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: theme.facilityAccentSoft }}>
                              Facilities / DCs
                            </div>
                            {facilityEntries.length === 0 ? (
                              <div style={{ fontSize: 12, color: theme.textSecondary }}>No facility presence</div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {facilityEntries.map((facility) => (
                                  <div
                                    key={`fac-detail-${metro}-${facility.id}`}
                                    style={{ fontSize: 12, color: theme.textPrimary }}
                                  >
                                    {facility.name}
                                    {facility.city ? (
                                      <span style={{ color: theme.textMuted }}> • {facility.city}</span>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  padding: 14,
                  background: theme.cardBg,
                  borderRadius: 10,
                  border: `1px solid ${theme.cardBorder}`,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
                }}
              >
                <div style={{ fontSize: 11, color: theme.textMuted, textTransform: "uppercase" }}>
                  Chart 1
                </div>
                <h3 style={{ margin: "2px 0 10px" }}>Deployed capacity across IXs in each metro</h3>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    marginBottom: 12,
                    fontSize: 12,
                    padding: 8,
                    borderRadius: 8,
                    border: `1px solid ${theme.cardBorder}`,
                    background: "#020617",
                  }}
                >
                  {ixColumnsSorted.map((ix) => (
                    <div
                      key={`compare-legend-${ix.id}`}
                      style={{ display: "flex", alignItems: "center", marginRight: 4, color: theme.textSecondary }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          marginRight: 4,
                          backgroundColor: ixColors[ix.id] || theme.ixAbsentFg,
                          border: `1px solid ${theme.gridBorder}`,
                        }}
                      />
                      <span>{ix.name}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {metroCapacityStacks.map((summary) => {
                    const widthPct =
                      maxMetroCapacityGbps > 0 ? (summary.totalGbps / maxMetroCapacityGbps) * 100 : 0;
                    return (
                      <div key={`cap-${summary.metro}`}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 6,
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <strong>{summary.metro}</strong>
                            <span style={{ color: theme.textSecondary }}>
                              {" "}
                              • {formatCount(summary.ixEntries.length)} IXs contributing capacity
                            </span>
                          </div>
                          <HoverCard
                            width={340}
                            label={
                              <span style={{ ...metricChipStyle("capacity"), padding: "5px 12px" }}>
                                {formatCapacity(summary.totalGbps)}
                              </span>
                            }
                          >
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>{summary.metro} deployed capacity</div>
                            <div style={{ color: theme.textSecondary, marginBottom: 8 }}>
                              Across {formatCount(summary.ixEntries.length)} IXs
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {summary.ixEntries.map((entry) => (
                                <div
                                  key={`compare-total-hover-${summary.metro}-${entry.ixId}`}
                                  style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
                                >
                                  <span style={{ color: theme.textSecondary }}>{entry.ixName}</span>
                                  <strong>{formatCapacity(entry.capacityGbps)}</strong>
                                </div>
                              ))}
                            </div>
                          </HoverCard>
                        </div>
                        <div
                          style={{
                            height: 24,
                            background: "#020617",
                            border: `1px solid ${theme.gridBorder}`,
                            borderRadius: 9999,
                            overflow: "hidden",
                            width: `${Math.max(widthPct, summary.totalGbps > 0 ? 12 : 0)}%`,
                            minWidth: summary.totalGbps > 0 ? 120 : 0,
                            display: "flex",
                          }}
                        >
                          {summary.ixEntries.map((entry) => {
                            const segmentWidth =
                              summary.totalGbps > 0 ? (entry.capacityGbps / summary.totalGbps) * 100 : 0;
                            return (
                              <div
                                key={`compare-stack-${summary.metro}-${entry.ixId}`}
                                title={`${summary.metro} • ${entry.ixName}: ${formatCapacity(entry.capacityGbps)}`}
                                style={{
                                  width: `${segmentWidth}%`,
                                  height: "100%",
                                  background: ixColors[entry.ixId] || theme.ixAbsentFg,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: segmentWidth > 18 ? "center" : "flex-end",
                                  paddingRight: segmentWidth > 18 ? 0 : 4,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: "#f8fafc",
                                  borderRight: `1px solid ${theme.gridBorder}`,
                                  overflow: "hidden",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {segmentWidth > 22 ? formatCount(Math.round(entry.capacityGbps)) : ""}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  padding: 14,
                  background: theme.cardBg,
                  borderRadius: 10,
                  border: `1px solid ${theme.cardBorder}`,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
                }}
              >
                <div style={{ fontSize: 11, color: theme.textMuted, textTransform: "uppercase" }}>
                  Chart 2
                </div>
                <h3 style={{ margin: "2px 0 10px" }}>Network presence across facilities/DCs in each metro</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {metroCompareSummaries.map((summary) => {
                    const widthPct =
                      maxMetroFacilityPresence > 0
                        ? (summary.facilityPresenceCount / maxMetroFacilityPresence) * 100
                        : 0;
                    return (
                      <div key={`fac-${summary.key}`}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 6,
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <strong>{summary.key}</strong>
                            <span style={{ color: theme.textSecondary }}>
                              {" "}
                              • {formatCount(summary.facilityCount)} facilities • {formatCount(summary.facilityNetworkCount)} networks present
                            </span>
                          </div>
                          <span style={{ ...metricChipStyle("facility"), padding: "5px 12px" }}>
                            {formatCount(summary.facilityPresenceCount)} total presences
                          </span>
                        </div>
                        <div
                          style={{
                            height: 24,
                            background: "#020617",
                            border: `1px solid ${theme.gridBorder}`,
                            borderRadius: 9999,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(widthPct, summary.facilityPresenceCount > 0 ? 6 : 0)}%`,
                              height: "100%",
                              background: "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              paddingRight: 10,
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#431407",
                            }}
                          >
                            {summary.facilityPresenceCount > 0 ? summary.facilityPresenceCount : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* SECTION 1 – ASN × IX matrix */}
          {activeView === "matrices" && sortedNetworks.length > 0 && ixColumnsSorted.length > 0 && (
            <div
              style={{
                padding: 14,
                background: theme.cardBg,
                borderRadius: 10,
                border: `1px solid ${theme.cardBorder}`,
                boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
              }}
            >
              <div
                style={{
                  marginBottom: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: theme.textMuted, textTransform: "uppercase" }}>
                    Section 1
                  </div>
                  <h3 style={{ margin: 0, marginTop: 2 }}>
                    ASN × IX – capacity in Gbps (green = present)
                  </h3>
                </div>
                <button
                  type="button"
                  style={{
                    fontSize: 12,
                    padding: "6px 10px",
                    borderRadius: 9999,
                    border: `1px solid ${theme.cardBorder}`,
                    background: theme.pillBg,
                    color: theme.textSoft,
                    cursor: "pointer",
                  }}
                  onClick={handleDownloadIxCsv}
                >
                  Download IX CSV
                </button>
              </div>
              <div
                style={{
                  maxHeight: 420,
                  overflow: "auto",
                  border: `1px solid ${theme.gridBorder}`,
                  borderRadius: 8,
                }}
              >
                <table
                  style={{
                    width: "100%",
                    minWidth: ixTableMinWidth,
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          ...headerCellBase,
                          textAlign: "left",
                          cursor: "pointer",
                          minWidth: 80,
                          fontWeight: 700,
                        }}
                        onClick={sortByAsn}
                      >
                        ASN{sortIndicator("asn")}
                      </th>
                      <th
                        style={{
                          ...headerCellBase,
                          textAlign: "left",
                          cursor: "pointer",
                          minWidth: nameColWidth,
                          maxWidth: nameColWidth,
                          width: nameColWidth,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontWeight: 700,
                        }}
                        onClick={sortByName}
                      >
                        Name{sortIndicator("name")}
                      </th>
                      {ixColumnsSorted.map((ix) => {
                        const count = ixCounts.get(ix.id) ?? 0;
                        const totalGbps = (ixCapacityTotals.get(ix.id) ?? 0) / 1000;
                        return (
                          <th
                            key={ix.id}
                            style={{
                              ...headerCellBase,
                              textAlign: "center",
                              cursor: "pointer",
                              minWidth: DATA_COL_MIN_WIDTH,
                            }}
                            onClick={() => sortByIx(ix.id)}
                          >
                            <div>
                              {ix.name}
                              {sortIndicator("ix", ix.id)}
                            </div>
                            <div style={{ fontSize: 11, color: theme.textSecondary }}>
                              {formatCount(count)} nets
                              {totalGbps > 0 ? ` • ${formatCapacity(totalGbps)}` : ""}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedNetworks.map((net, rowIndex) => (
                      <tr
                        key={net.netId}
                        style={{
                          backgroundColor:
                            rowIndex % 2 === 0 ? theme.tableRowAlt1 : theme.tableRowAlt2,
                          borderBottom: `1px solid ${theme.gridBorder}`,
                        }}
                      >
                        <td style={{ ...bodyCellBase, minWidth: 80, fontWeight: 600 }}>
                          {net.asn ?? "?"}
                        </td>
                        <td
                          style={{
                            ...bodyCellBase,
                            minWidth: nameColWidth,
                            maxWidth: nameColWidth,
                            width: nameColWidth,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            fontWeight: 600,
                          }}
                          title={net.name ?? ""}
                        >
                          {net.name ?? ""}
                        </td>
                        {ixColumnsSorted.map((ix) => {
                          const capMbps = net.ixCaps.get(ix.id) ?? 0;
                          const capGbps = capMbps / 1000;
                          const present = capGbps > 0;
                          return (
                            <td
                              key={ix.id}
                              style={{
                                ...bodyCellBase,
                                textAlign: "center",
                                minWidth: DATA_COL_MIN_WIDTH,
                                backgroundColor: present ? theme.ixPresentBg : "transparent",
                                color: present ? theme.ixPresentFg : theme.ixAbsentFg,
                                fontWeight: present ? 600 : 400,
                              }}
                            >
                              {present ? formatCount(Math.round(capGbps)) : "–"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION 2 – stacked capacity distribution */}
          {activeView === "matrices" && capacityStats.rows.length > 0 && (
            <div
              style={{
                padding: 14,
                background: theme.cardBg,
                borderRadius: 10,
                border: `1px solid ${theme.cardBorder}`,
                boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: theme.textMuted, textTransform: "uppercase" }}>
                  Section 2
                </div>
                <h3 style={{ margin: 0, marginTop: 2 }}>By capacity – stacked by IX (Gbps)</h3>
                <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
                  Total capacity across selected IX columns and networks:{" "}
                  <strong style={{ color: theme.capacityAccentSoft }}>{formatCapacity(capacityStats.grandTotalGbps)}</strong>
                </div>
              </div>

              {/* legend */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  marginBottom: 8,
                  fontSize: 12,
                  padding: 8,
                  borderRadius: 8,
                  border: `1px solid ${theme.cardBorder}`,
                  background: "#020617",
                }}
              >
                {ixColumnsSorted.map((ix) => (
                  <div
                    key={ix.id}
                    style={{ display: "flex", alignItems: "center", marginRight: 4, color: theme.textSecondary }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        marginRight: 4,
                        backgroundColor: ixColors[ix.id] || theme.ixAbsentFg,
                        border: `1px solid ${theme.gridBorder}`,
                      }}
                    />
                    <span>{ix.name}</span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  maxHeight: 320,
                  overflowY: "auto",
                  border: `1px solid ${theme.gridBorder}`,
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                {capacityStats.rows.map((row) => {
                  const { net, segments, totalGbps } = row;
                  const share =
                    capacityStats.grandTotalGbps > 0
                      ? (totalGbps / capacityStats.grandTotalGbps) * 100
                      : 0;

                  return (
                    <div key={net.netId} style={{ marginBottom: 10 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <div style={{ fontSize: 13, maxWidth: "65%" }}>
                          <strong>{net.asn}</strong>{" "}
                          <span style={{ color: theme.textSecondary }}>{net.name}</span>
                        </div>
                        <div style={{ fontSize: 12, whiteSpace: "nowrap", color: theme.capacityAccentSoft, fontWeight: 700 }}>
                          {formatCapacity(totalGbps)} ({oneDecimalFormatter.format(share)}%)
                        </div>
                      </div>

                      <div
                        style={{
                          height: 32,
                          background: "#020617",
                          borderRadius: 6,
                          overflow: "hidden",
                          display: "flex",
                          border: `1px solid ${theme.gridBorder}`,
                        }}
                      >
                        {segments.map((seg: CapacitySegment) => {
                          const widthPct = totalGbps > 0 ? (seg.gbps / totalGbps) * 100 : 0;
                          const pctOfNet = totalGbps > 0 ? (seg.gbps / totalGbps) * 100 : 0;
                          const label = `${Math.round(seg.gbps)} (${pctOfNet.toFixed(0)}%)`;

                          return (
                            <div
                              key={`${net.netId}-${seg.ixId}`}
                              title={`${seg.ixName}: ${formatCapacity(seg.gbps)} (${pctOfNet.toFixed(
                                1
                              )}%)`}
                              style={{
                                width: `${Math.max(3, widthPct)}%`,
                                backgroundColor: ixColors[seg.ixId] || theme.ixAbsentFg,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: widthPct < 8 ? 10 : 12,
                                color: "#f9fafb",
                                fontWeight: 700,
                                whiteSpace: "normal",
                                textAlign: "center",
                                padding: "0 2px",
                                borderRight: `1px solid ${theme.gridBorder}`,
                                textShadow: "0 1px 2px rgba(0,0,0,0.85)",
                              }}
                            >
                              {label}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECTION 3 – facility matrix */}
          {activeView === "matrices" && sortedNetworks.length > 0 && facColumnsFlat.length > 0 && (
            <div
              style={{
                padding: 14,
                background: theme.cardBg,
                borderRadius: 10,
                border: `1px solid ${theme.cardBorder}`,
                boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
              }}
            >
              <div
                style={{
                  marginBottom: 8,
                  display: "flex",
                  justifyContent: "spaceBetween",
                  alignItems: "center",
                } as any}
              >
                <div>
                  <div style={{ fontSize: 11, color: theme.textMuted, textTransform: "uppercase" }}>
                    Section 3
                  </div>
                  <h3 style={{ margin: 0, marginTop: 2 }}>
                    ASN × Facility – presence by organization (green = present)
                  </h3>
                </div>
                <button
                  type="button"
                  style={{
                    fontSize: 12,
                    padding: "6px 10px",
                    borderRadius: 9999,
                    border: `1px solid ${theme.cardBorder}`,
                    background: theme.pillBg,
                    color: theme.textSoft,
                    cursor: "pointer",
                  }}
                  onClick={handleDownloadFacCsv}
                >
                  Download facility CSV
                </button>
              </div>
              <div
                style={{
                  maxHeight: 420,
                  overflow: "auto",
                  border: `1px solid ${theme.gridBorder}`,
                  borderRadius: 8,
                }}
              >
                <table
                  style={{
                    width: "100%",
                    minWidth: facTableMinWidth,
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          ...headerCellBase,
                          textAlign: "left",
                          minWidth: 80,
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                        rowSpan={2}
                        onClick={sortByAsn}
                      >
                        ASN{sortIndicator("asn")}
                      </th>
                      <th
                        style={{
                          ...headerCellBase,
                          textAlign: "left",
                          minWidth: nameColWidth,
                          maxWidth: nameColWidth,
                          width: nameColWidth,
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                        rowSpan={2}
                        onClick={sortByName}
                      >
                        Name{sortIndicator("name")}
                      </th>
                      {orgGroups.map((g) => (
                        <th
                          key={g.org}
                          style={{
                            ...headerCellBase,
                            textAlign: "center",
                          }}
                          colSpan={g.facilities.length || 1}
                        >
                          <div>{g.org}</div>
                          <div style={{ fontSize: 11, color: theme.textSecondary }}>
                            {formatCount(g.totalNetworks)} nets
                          </div>
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {orgGroups.flatMap((g) =>
                        g.facilities.map((f) => {
                          const facId = f.fac.id;
                          const facCount = facNetworkCounts.get(facId) ?? 0;
                          return (
                            <th
                              key={f.fac.id}
                              style={{
                                ...headerCellBase,
                                top: 30,
                                textAlign: "center",
                                minWidth: DATA_COL_MIN_WIDTH,
                              }}
                            >
                              <div>{f.fac.name}</div>
                              <div style={{ fontSize: 11, color: theme.textSecondary }}>
                                {formatCount(facCount)} nets
                              </div>
                            </th>
                          );
                        })
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedNetworks.map((net, rowIndex) => (
                      <tr
                        key={net.netId}
                        style={{
                          backgroundColor:
                            rowIndex % 2 === 0 ? theme.tableRowAlt1 : theme.tableRowAlt2,
                          borderBottom: `1px solid ${theme.gridBorder}`,
                        }}
                      >
                        <td style={{ ...bodyCellBase, minWidth: 80, fontWeight: 600 }}>
                          {net.asn ?? "?"}
                        </td>
                        <td
                          style={{
                            ...bodyCellBase,
                            minWidth: nameColWidth,
                            maxWidth: nameColWidth,
                            width: nameColWidth,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            fontWeight: 600,
                          }}
                          title={net.name ?? ""}
                        >
                          {net.name ?? ""}
                        </td>
                        {orgGroups.flatMap((g) =>
                          g.facilities.map((f) => {
                            const present = net.facIds.has(f.fac.id);
                            return (
                              <td
                                key={`${net.netId}-${f.fac.id}`}
                                style={{
                                  ...bodyCellBase,
                                  textAlign: "center",
                                  minWidth: DATA_COL_MIN_WIDTH,
                                  backgroundColor: present ? theme.ixPresentBg : "transparent",
                                  color: present ? theme.ixPresentFg : theme.ixAbsentFg,
                                  fontWeight: present ? 600 : 400,
                                }}
                              >
                                {present ? "●" : "–"}
                              </td>
                            );
                          })
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {metroNetworks.length === 0 && !allNetLoading && !error && (
            <div
              style={{
                fontSize: 13,
                color: theme.textMuted,
                padding: 12,
                borderRadius: 8,
                border: `1px dashed ${theme.cardBorder}`,
                background: theme.cardBg,
              }}
            >
              Click <strong>"Load all networks in metros"</strong> to build the matrices.
            </div>
          )}

          {activeView === "compare" && metroNetworks.length > 0 && metroCompareSummaries.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: theme.textMuted,
                padding: 12,
                borderRadius: 8,
                border: `1px dashed ${theme.cardBorder}`,
                background: theme.cardBg,
              }}
            >
              No metro comparison data is available for the current load yet.
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default PeeringDBDashboard;
