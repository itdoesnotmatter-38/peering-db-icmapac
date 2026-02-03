import React, { useState, useEffect } from "react";
import { fetchPeeringDb } from "./peeringdbApi";

/**
 * Theme – dark but with clearer contrast and borders.
 */
const theme = {
  appBg: "#020617",
  headerBg: "#020617",
  headerBorder: "#1f2937",
  cardBg: "#020617",
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
  textMuted: "#9ca3af",
  textSoft: "#9ca3af",
  ixPresentBg: "#14532d",
  ixPresentFg: "#bbf7d0",
  ixAbsentFg: "#6b7280",
  pillBg: "#020617",
  pillBorder: "#4b5563",
};

/**
 * Metro presets.
 */
const METROS = {
  Singapore: { country: "SG", city: "Singapore" },
  Jakarta: { country: "ID", city: "Jakarta" },
  "Kuala Lumpur": { country: "MY", city: "Kuala Lumpur" },

  Melbourne: { country: "AU", city: "Melbourne" },
  Sydney: { country: "AU", city: "Sydney" },
  Mumbai: { country: "IN", city: "Mumbai" },
  "Hong Kong": { country: "HK", city: "Hong Kong" },
  Chennai: { country: "IN", city: "Chennai" },
  Seoul: { country: "KR", city: "Seoul" },
  Tokyo: { country: "JP", city: "Tokyo" },
  Osaka: { country: "JP", city: "Osaka" },
  Perth: { country: "AU", city: "Perth" },
};

type MetroKey = keyof typeof METROS;

interface MetroNetwork {
  netId: number;
  asn?: number;
  name?: string; // PeeringDB net.name (organization)
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

const DEFAULT_NAME_COL_WIDTH = 220;
const DATA_COL_MIN_WIDTH = 90;
const BASE_TABLE_MIN_WIDTH = 600;

type SortKey = "asn" | "name" | "ix";

interface SortState {
  key: SortKey;
  direction: "asc" | "desc";
  ixId?: number;
}

const PeeringDBDashboard: React.FC = () => {
  // Metro selection for NEXT load.
  const [selectedMetros, setSelectedMetros] = useState<MetroKey[]>(["Singapore"]);

  // Metros and timestamp for the LAST successful load.
  const [lastLoadedMetros, setLastLoadedMetros] = useState<MetroKey[]>([]);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  // Cached IX/FAC per metro (so we don't refetch every time).
  const [ixCache, setIxCache] = useState<Partial<Record<MetroKey, any[]>>>({});
  const [facCache, setFacCache] = useState<Partial<Record<MetroKey, any[]>>>({});

  // Active IX/FAC data for lastLoadedMetros (union).
  const [ixData, setIxData] = useState<any[]>([]);
  const [facData, setFacData] = useState<any[]>([]);

  // Networks (built when you click Load).
  const [metroNetworks, setMetroNetworks] = useState<MetroNetwork[]>([]);

  // Loading / errors.
  const [allNetLoading, setAllNetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allNetError, setAllNetError] = useState<string | null>(null);

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

  // Facility org lookup.
  const [orgLookup, setOrgLookup] = useState<Record<number, any>>({});

  const metroLabel =
    selectedMetros.length === 0
      ? "None"
      : selectedMetros
          .map((m) => `${METROS[m].city} (${METROS[m].country})`)
          .join(" + ");

  const loadedMetroLabel =
    lastLoadedMetros.length === 0
      ? "None"
      : lastLoadedMetros
          .map((m) => `${METROS[m].city} (${METROS[m].country})`)
          .join(" + ");

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
        const chunks = chunk(orgIds, 50);
        const acc: Record<number, any> = {};
        for (const ch of chunks) {
          const { data } = await fetchPeeringDb<any>("org", {
            id__in: ch.join(","),
          });
          data.forEach((org: any) => {
            if (org && typeof org.id === "number") {
              acc[org.id] = org;
            }
          });
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

  // ---- Load ALL networks for selectedMetros (using cache where possible) ----
  const handleLoadAllNetworks = async () => {
    if (selectedMetros.length === 0) {
      setAllNetError("Select at least one metro.");
      return;
    }

    setError(null);
    setAllNetError(null);
    setAllNetLoading(true);
    setMetroNetworks([]);

    try {
      const workingIxCache: Partial<Record<MetroKey, any[]>> = { ...ixCache };
      const workingFacCache: Partial<Record<MetroKey, any[]>> = { ...facCache };

      // Fetch IX/FAC only for metros that are not in cache yet.
      for (const m of selectedMetros) {
        const ixList = workingIxCache[m];
        const facList = workingFacCache[m];
        const needsIx = !Array.isArray(ixList) || ixList.length === 0;
        const needsFac = !Array.isArray(facList) || facList.length === 0;

        if (!needsIx && !needsFac) continue;

        const cfg = METROS[m];
        const ixParams = { country: cfg.country, city: cfg.city };
        const facParams =
          cfg.country === "HK" || cfg.country === "SG"
            ? { country: cfg.country }
            : { country: cfg.country, city: cfg.city };

        let ixResult: { data: any[] };
        let facResult: { data: any[] };
        try {
          [ixResult, facResult] = await Promise.all([
            fetchPeeringDb<any>("ix", ixParams),
            fetchPeeringDb<any>("fac", facParams),
          ]);
        } catch (err: any) {
          throw new Error(
            `Failed to load IX/FAC for ${cfg.city} (${cfg.country}): ${err?.message || err}`
          );
        }

        workingIxCache[m] = ixResult.data || [];
        workingFacCache[m] = facResult.data || [];
      }

      // Build union IX/FAC for the selectedMetros (for this load).
      const ixArr: any[] = [];
      const facArr: any[] = [];
      const ixSeen = new Set<number>();
      const facSeen = new Set<number>();

      selectedMetros.forEach((m) => {
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
        setAllNetError("No IX or facility IDs found for the selected metros.");
        return;
      }

      // ---- Build MetroNetwork map using netixlan + netfac ----
      const netMap = new Map<number, MetroNetwork>();

      // 1) IX presence + capacity via netixlan.
      const ixChunks = chunk(ixIds, 20);
      for (const ch of ixChunks) {
        const param = ch.join(",");
        let rows: any[] = [];
        try {
          ({ data: rows } = await fetchPeeringDb<any>("netixlan", {
            ix_id__in: param,
            all: 1,
          }));
        } catch (err: any) {
          throw new Error(`netixlan fetch failed for ix_id__in=${param}: ${err?.message || err}`);
        }

        rows.forEach((row: any) => {
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
          entry.ixCaps.set(ixId, prev + (speed > 0 ? speed : 0)); // only sum positive speeds
        });
      }

      // 2) Facility presence via netfac.
      if (facIds.length > 0) {
        const facChunks = chunk(facIds, 20);
        for (const ch of facChunks) {
          const param = ch.join(",");
          let rows: any[] = [];
          try {
            ({ data: rows } = await fetchPeeringDb<any>("netfac", {
              fac_id__in: param,
              all: 1,
            }));
          } catch (err: any) {
            throw new Error(`netfac fetch failed for fac_id__in=${param}: ${err?.message || err}`);
          }

          rows.forEach((row: any) => {
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
        }
      }

      // 3) Enrich network names + ASN from /net?id__in=
      const netIds = Array.from(netMap.keys());
      const netIdChunks = chunk(netIds, 50);

      for (const idChunk of netIdChunks) {
        const param = idChunk.join(",");
        let nets: any[] = [];
        try {
          ({ data: nets } = await fetchPeeringDb<any>("net", {
            id__in: param,
          }));
        } catch (err: any) {
          throw new Error(`net fetch failed for id__in=${param}: ${err?.message || err}`);
        }

        nets.forEach((netObj) => {
          const netId = netObj.id;
          if (!netId) return;
          const entry = netMap.get(netId);
          if (!entry) return;

          if (typeof netObj.asn === "number") {
            entry.asn = netObj.asn;
          }
          const label: string | undefined = netObj.org || netObj.name;
          if (label) {
            entry.name = label;
          }
        });
      }

      const networks = Array.from(netMap.values())
        .filter((n) => typeof n.asn === "number")
        .sort((a, b) => {
          const aAsn = a.asn ?? Number.MAX_SAFE_INTEGER;
          const bAsn = b.asn ?? Number.MAX_SAFE_INTEGER;
          return aAsn - bAsn;
        });

      // Commit cache and network data; mark last-loaded metros + timestamp.
      setIxCache(workingIxCache);
      setFacCache(workingFacCache);
      setMetroNetworks(networks);
      setLastLoadedMetros(selectedMetros);
      setLastLoadedAt(new Date());
    } catch (e: any) {
      console.error(e);
      if (!error) {
        setAllNetError(e?.message || "Error loading networks for metros.");
      }
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

  // ---- map IX IDs to metros (for summaries) ----
  const metroIxIdsMap = React.useMemo(() => {
    const result: Partial<Record<MetroKey, number[]>> = {};
    (Object.keys(METROS) as MetroKey[]).forEach((m) => {
      result[m] = [];
    });

    ixData.forEach((ix) => {
      const country = ix.country;
      const city = ix.city;
      (Object.keys(METROS) as MetroKey[]).forEach((m) => {
        const cfg = METROS[m];
        if (cfg.country === country && cfg.city === city) {
          (result[m] as number[]).push(ix.id);
        }
      });
    });

    return result as Record<MetroKey, number[]>;
  }, [ixData]);

  // ---- per-metro summaries for lastLoadedMetros ----
  const metroSummaries = React.useMemo(() => {
    const summaries: { key: MetroKey; totalGbps: number; uniqueNets: number }[] = [];
    if (sortedNetworks.length === 0 || lastLoadedMetros.length === 0) return summaries;

    lastLoadedMetros.forEach((mKey) => {
      const ids = new Set(metroIxIdsMap[mKey] || []);
      if (ids.size === 0) {
        summaries.push({ key: mKey, totalGbps: 0, uniqueNets: 0 });
        return;
      }

      let totalGbps = 0;
      let uniqueNets = 0;

      sortedNetworks.forEach((net) => {
        let hasCap = false;
        net.ixCaps.forEach((cap, ixId) => {
          if (ids.has(ixId) && cap > 0) {
            totalGbps += cap / 1000;
            hasCap = true;
          }
        });
        if (hasCap) uniqueNets += 1;
      });

      summaries.push({ key: mKey, totalGbps, uniqueNets });
    });

    return summaries;
  }, [sortedNetworks, lastLoadedMetros, metroIxIdsMap]);

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
          <h2 style={{ margin: 0, fontSize: 20 }}>PeeringDB – Metro ASN × IX / Facility Matrix</h2>
          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
            Metro selection (for next load): <strong>{metroLabel}</strong>
          </div>
        </div>
        <div
          style={{
            fontSize: 13,
            color: theme.textSoft,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            justifyContent: "flex-end",
            maxWidth: "100%",
            paddingBottom: 4,
          }}
        >
          {(Object.keys(METROS) as MetroKey[]).map((m) => (
            <label
              key={m}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 9999,
                border: `1px solid ${selectedMetros.includes(m) ? "#22c55e" : theme.pillBorder}`,
                background: theme.pillBg,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="checkbox"
                checked={selectedMetros.includes(m)}
                onChange={() => toggleMetroSelection(m)}
                style={{ accentColor: "#22c55e" }}
              />
              <span>{m}</span>
            </label>
          ))}
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
            fontSize: 13,
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
            {allNetLoading ? "Loading all networks…" : "Load all networks in metros"}
          </button>

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
            fontSize: 13,
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
                        color: "#f9fafb",
                      }}
                    >
                      {s.totalGbps.toFixed(1)} Gbps
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        color: theme.textSoft,
                        fontWeight: 600,
                      }}
                    >
                      {s.uniqueNets} unique networks
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SECTION 1 – ASN × IX matrix */}
          {sortedNetworks.length > 0 && ixColumnsSorted.length > 0 && (
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
                            <div style={{ fontSize: 11, color: theme.textMuted }}>
                              {count} nets
                              {totalGbps > 0 ? ` • ${totalGbps.toFixed(1)} Gbps` : ""}
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
                              {present ? Math.round(capGbps) : "–"}
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
          {capacityStats.rows.length > 0 && (
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
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                  Total capacity across selected IX columns and networks:{" "}
                  <strong>{capacityStats.grandTotalGbps.toFixed(1)} Gbps</strong>
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
                    style={{ display: "flex", alignItems: "center", marginRight: 4 }}
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
                          <span style={{ color: theme.textMuted }}>{net.name}</span>
                        </div>
                        <div style={{ fontSize: 12, whiteSpace: "nowrap", color: theme.textSoft }}>
                          {totalGbps.toFixed(1)} Gbps ({share.toFixed(1)}%)
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
                              title={`${seg.ixName}: ${seg.gbps.toFixed(1)} Gbps (${pctOfNet.toFixed(
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
          {sortedNetworks.length > 0 && facColumnsFlat.length > 0 && (
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
                          <div style={{ fontSize: 11, color: theme.textMuted }}>
                            {g.totalNetworks} nets
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
                              <div style={{ fontSize: 11, color: theme.textMuted }}>
                                {facCount} nets
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
        </section>
      </main>
    </div>
  );
};

export default PeeringDBDashboard;
