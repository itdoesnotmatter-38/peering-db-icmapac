import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { withApiRoot } from "./apiBase";

type SnapshotRun = {
  snapshotDate: string;
  netCount: number | null;
  orgCount: number | null;
  netUrl: string | null;
  orgUrl: string | null;
  manifestUrl: string | null;
  networksCsvUrl: string | null;
};

type ExportScope = "country" | "region";

const COUNTRY_OPTIONS = [
  { code: "SG", label: "Singapore" },
  { code: "ID", label: "Indonesia" },
  { code: "MY", label: "Malaysia" },
  { code: "TH", label: "Thailand" },
  { code: "PH", label: "Philippines" },
  { code: "AU", label: "Australia" },
  { code: "IN", label: "India" },
  { code: "HK", label: "Hong Kong" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
];

const REGION_OPTIONS = [
  {
    code: "APAC",
    label: "APAC",
    description: "Portal coverage across SG, ID, MY, TH, PH, AU, IN, HK, JP, and KR.",
  },
  {
    code: "EMEA",
    label: "EMEA",
    description: "Portal coverage across GB, NL, DE, FR, and ES metros.",
  },
  {
    code: "AMER",
    label: "AMER",
    description: "Portal coverage across the tracked US metros.",
  },
];

const shell = {
  bg: "#020617",
  panel: "#09111f",
  border: "#334155",
  text: "#e5e7eb",
  muted: "#94a3b8",
  accent: "#22c55e",
};

const buildSnapshotCsvUrl = (snapshotDate: string) =>
  withApiRoot(`/api/snapshots/csv?snapshotDate=${encodeURIComponent(snapshotDate)}`);

const buildSnapshotOriginCountriesCsvUrl = (snapshotDate: string) =>
  withApiRoot(`/api/snapshots/origin-countries-csv?snapshotDate=${encodeURIComponent(snapshotDate)}`);

const buildSnapshotOriginNetworksCsvUrl = (snapshotDate: string) =>
  withApiRoot(`/api/snapshots/origin-networks-csv?snapshotDate=${encodeURIComponent(snapshotDate)}`);

const buildSnapshotScopedExportUrl = (
  snapshotDate: string,
  scope: ExportScope,
  scopeCode: string,
  view: "ix" | "facility" | "combined"
) =>
  withApiRoot(
    `/api/snapshots/country-csv?snapshotDate=${encodeURIComponent(snapshotDate)}&${
      scope === "country" ? "country" : "region"
    }=${encodeURIComponent(scopeCode)}&view=${view}`
  );

export default function DownloadsPage() {
  const [snapshotRuns, setSnapshotRuns] = useState<SnapshotRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportScope, setExportScope] = useState<ExportScope>("country");
  const [country, setCountry] = useState("SG");
  const [region, setRegion] = useState("APAC");
  const [selectedSnapshotDate, setSelectedSnapshotDate] = useState("");

  const activeRegionOption =
    REGION_OPTIONS.find((option) => option.code === region) || REGION_OPTIONS[0];
  const activeScopeCode = exportScope === "country" ? country : region;

  useEffect(() => {
    const loadSnapshots = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(withApiRoot("/api/snapshots/latest?limit=12"));
        const json = await resp.json().catch(() => null);
        if (!resp.ok) {
          throw new Error(json?.error || `Snapshot API error: ${resp.status}`);
        }
        const runs = Array.isArray(json?.runs) ? json.runs : [];
        setSnapshotRuns(runs);
        setSelectedSnapshotDate((prev) => prev || runs[0]?.snapshotDate || "");
      } catch (err: any) {
        setError(err?.message || "Failed to load snapshot downloads.");
      } finally {
        setLoading(false);
      }
    };

    loadSnapshots();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: shell.bg,
        color: shell.text,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1160,
          margin: "0 auto",
          padding: "28px 20px 40px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 30, fontWeight: 700 }}>Downloads</div>
            <div style={{ color: shell.muted, marginTop: 6 }}>
              Snapshot files plus country and region CSV exports for IX and facility views.
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link
              to="/trends"
              style={{
                color: shell.text,
                textDecoration: "none",
                border: `1px solid ${shell.border}`,
                padding: "10px 14px",
                borderRadius: 999,
              }}
            >
              APAC trends
            </Link>
            <Link
              to="/"
              style={{
                color: shell.text,
                textDecoration: "none",
                border: `1px solid ${shell.border}`,
                padding: "10px 14px",
                borderRadius: 999,
              }}
            >
              Back to dashboard
            </Link>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(300px, 420px) minmax(300px, 1fr)",
            gap: 20,
          }}
        >
          <section
            style={{
              background: shell.panel,
              border: `1px solid ${shell.border}`,
              borderRadius: 18,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Snapshot market exports</div>
            <div style={{ color: shell.muted, lineHeight: 1.5, marginBottom: 16 }}>
              Generate country or region CSVs from a stored snapshot. `IX view` is pivot-friendly:
              one row per network per IX, with deployed capacity in its own column. `Facility view`
              is one row per network per facility/DC. `Combined view` puts both record types into one file.
            </div>

            <label style={{ display: "block", fontSize: 13, color: shell.muted, marginBottom: 8 }}>
              Snapshot date
            </label>
            <select
              value={selectedSnapshotDate}
              onChange={(e) => setSelectedSnapshotDate(e.target.value)}
              style={{
                width: "100%",
                background: shell.bg,
                color: shell.text,
                border: `1px solid ${shell.border}`,
                borderRadius: 12,
                padding: "12px 14px",
                marginBottom: 16,
              }}
            >
              {snapshotRuns.map((run) => (
                <option key={run.snapshotDate} value={run.snapshotDate}>
                  {run.snapshotDate}
                </option>
              ))}
            </select>

            <label style={{ display: "block", fontSize: 13, color: shell.muted, marginBottom: 8 }}>
              Export scope
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
              {(["country", "region"] as ExportScope[]).map((scope) => {
                const active = exportScope === scope;
                return (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setExportScope(scope)}
                    style={{
                      background: active ? shell.accent : shell.bg,
                      color: active ? "#052e16" : shell.text,
                      border: `1px solid ${active ? shell.accent : shell.border}`,
                      borderRadius: 999,
                      padding: "10px 14px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {scope === "country" ? "Country export" : "Region export"}
                  </button>
                );
              })}
            </div>

            {exportScope === "country" ? (
              <>
                <label style={{ display: "block", fontSize: 13, color: shell.muted, marginBottom: 8 }}>
                  Country
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  style={{
                    width: "100%",
                    background: shell.bg,
                    color: shell.text,
                    border: `1px solid ${shell.border}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                    marginBottom: 16,
                  }}
                >
                  {COUNTRY_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label} ({option.code})
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label style={{ display: "block", fontSize: 13, color: shell.muted, marginBottom: 8 }}>
                  Region
                </label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  style={{
                    width: "100%",
                    background: shell.bg,
                    color: shell.text,
                    border: `1px solid ${shell.border}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                    marginBottom: 8,
                  }}
                >
                  {REGION_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div style={{ color: shell.muted, fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
                  {activeRegionOption.description}
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href={buildSnapshotScopedExportUrl(selectedSnapshotDate, exportScope, activeScopeCode, "combined")}
                style={{
                  background: "#93c5fd",
                  color: "#172554",
                  textDecoration: "none",
                  padding: "12px 16px",
                  borderRadius: 12,
                  fontWeight: 700,
                }}
              >
                Download combined CSV
              </a>
              <a
                href={buildSnapshotScopedExportUrl(selectedSnapshotDate, exportScope, activeScopeCode, "ix")}
                style={{
                  background: shell.accent,
                  color: "#052e16",
                  textDecoration: "none",
                  padding: "12px 16px",
                  borderRadius: 12,
                  fontWeight: 700,
                }}
              >
                Download IX pivot CSV
              </a>
              <a
                href={buildSnapshotScopedExportUrl(selectedSnapshotDate, exportScope, activeScopeCode, "facility")}
                style={{
                  background: "#d1fae5",
                  color: "#14532d",
                  textDecoration: "none",
                  padding: "12px 16px",
                  borderRadius: 12,
                  fontWeight: 700,
                }}
              >
                Download facility pivot CSV
              </a>
            </div>
            <div style={{ color: shell.muted, lineHeight: 1.5, marginTop: 12, fontSize: 13 }}>
              Region exports follow the portal's tracked metro footprint rather than every country in the wider region.
            </div>
            {!selectedSnapshotDate && (
              <div style={{ color: shell.muted, marginTop: 12 }}>No snapshot is available yet.</div>
            )}
          </section>

          <section
            style={{
              background: shell.panel,
              border: `1px solid ${shell.border}`,
              borderRadius: 18,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Snapshot downloads</div>
            <div style={{ color: shell.muted, lineHeight: 1.5, marginBottom: 16 }}>
              Download stored snapshot files. `origin-networks.csv` gives one row per network with its
              organization country and city.
            </div>

            {loading && <div style={{ color: shell.muted }}>Loading snapshot list...</div>}
            {error && <div style={{ color: "#fca5a5" }}>{error}</div>}
            {!loading && !error && snapshotRuns.length === 0 && (
              <div style={{ color: shell.muted }}>No completed snapshots found.</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {snapshotRuns.map((run) => (
                <div
                  key={run.snapshotDate}
                  style={{
                    border: `1px solid ${shell.border}`,
                    borderRadius: 14,
                    padding: 14,
                    background: shell.bg,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{run.snapshotDate}</div>
                  <div style={{ color: shell.muted, fontSize: 13, marginTop: 4 }}>
                    {run.netCount ?? "-"} nets / {run.orgCount ?? "-"} orgs
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
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
                    <a
                      href={buildSnapshotOriginCountriesCsvUrl(run.snapshotDate)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#86efac" }}
                    >
                      origin-countries.csv
                    </a>
                    <a
                      href={buildSnapshotOriginNetworksCsvUrl(run.snapshotDate)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#86efac" }}
                    >
                      origin-networks.csv
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
