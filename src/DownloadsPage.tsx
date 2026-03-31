import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type SnapshotRun = {
  snapshotDate: string;
  netCount: number | null;
  orgCount: number | null;
  netUrl: string | null;
  orgUrl: string | null;
  manifestUrl: string | null;
  networksCsvUrl: string | null;
};

const COUNTRY_OPTIONS = [
  { code: "SG", label: "Singapore" },
  { code: "ID", label: "Indonesia" },
  { code: "MY", label: "Malaysia" },
  { code: "TH", label: "Thailand" },
  { code: "AU", label: "Australia" },
  { code: "IN", label: "India" },
  { code: "HK", label: "Hong Kong" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
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
  `/api/snapshots/csv?snapshotDate=${encodeURIComponent(snapshotDate)}`;

const buildSnapshotCountryExportUrl = (
  snapshotDate: string,
  country: string,
  view: "ix" | "facility"
) =>
  `/api/snapshots/country-csv?snapshotDate=${encodeURIComponent(snapshotDate)}&country=${encodeURIComponent(country)}&view=${view}`;

export default function DownloadsPage() {
  const [snapshotRuns, setSnapshotRuns] = useState<SnapshotRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState("SG");
  const [selectedSnapshotDate, setSelectedSnapshotDate] = useState("");

  useEffect(() => {
    const loadSnapshots = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch("/api/snapshots/latest?limit=12");
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
              Snapshot files and country-based CSV exports for IX and facility views.
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Snapshot country exports</div>
            <div style={{ color: shell.muted, lineHeight: 1.5, marginBottom: 16 }}>
              Generate country-specific CSVs from a stored snapshot. `IX view` summarizes each
              network's deployed capacity across all IXs in the selected market, while `facility view`
              summarizes each network's presence across all facilities in that market. Bangkok exports
              use `Thailand (TH)`.
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

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href={buildSnapshotCountryExportUrl(selectedSnapshotDate, country, "ix")}
                style={{
                  background: shell.accent,
                  color: "#052e16",
                  textDecoration: "none",
                  padding: "12px 16px",
                  borderRadius: 12,
                  fontWeight: 700,
                }}
              >
                Download IX view CSV
              </a>
              <a
                href={buildSnapshotCountryExportUrl(selectedSnapshotDate, country, "facility")}
                style={{
                  background: "#d1fae5",
                  color: "#14532d",
                  textDecoration: "none",
                  padding: "12px 16px",
                  borderRadius: 12,
                  fontWeight: 700,
                }}
              >
                Download facility view CSV
              </a>
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
              Download stored snapshot files. `networks.csv` is available either from stored blob output or
              generated on demand from the snapshot source files.
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
