import React, { useEffect, useMemo, useState } from "react";
import { withApiRoot } from "../apiBase";
import { Panel } from "./bits";
import { fmtDate } from "./data";

/* Snapshot downloads, reskinned into the shell. Reads the same endpoints
   as the legacy page: /api/snapshots/latest for the run list, and the
   country/region CSV builders for market exports. */

interface Run {
  snapshotDate: string;
  status: string;
  netCount?: number;
  orgCount?: number;
  netUrl?: string;
  orgUrl?: string;
  manifestUrl?: string;
  networksCsvUrl?: string;
}

const csvUrl = (d: string) => withApiRoot(`/api/snapshots/csv?snapshotDate=${encodeURIComponent(d)}`);
const originCountriesUrl = (d: string) => withApiRoot(`/api/snapshots/origin-countries-csv?snapshotDate=${encodeURIComponent(d)}`);
const originNetworksUrl = (d: string) => withApiRoot(`/api/snapshots/origin-networks-csv?snapshotDate=${encodeURIComponent(d)}`);
const marketUrl = (d: string, kind: "country" | "region", code: string, view: string) =>
  withApiRoot(`/api/snapshots/country-csv?snapshotDate=${encodeURIComponent(d)}&${kind}=${encodeURIComponent(code)}&view=${view}`);

const COUNTRIES = [
  ["SG", "Singapore"],
  ["HK", "Hong Kong"],
  ["JP", "Japan"],
  ["ID", "Indonesia"],
  ["AU", "Australia"],
  ["IN", "India"],
  ["MY", "Malaysia"],
  ["TH", "Thailand"],
  ["PH", "Philippines"],
  ["KR", "South Korea"],
];
const REGIONS = [
  ["APAC", "APAC"],
  ["EMEA", "EMEA"],
  ["AMER", "AMER"],
];

export default function DownloadsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [snapshotDate, setSnapshotDate] = useState("");
  const [scopeKind, setScopeKind] = useState<"country" | "region">("country");
  const [code, setCode] = useState("SG");
  const [view, setView] = useState("ix");

  useEffect(() => {
    let alive = true;
    fetch(withApiRoot("/api/snapshots/latest?limit=12"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (!alive) return;
        const list: Run[] = j.runs || (j.latest ? [j.latest] : []);
        setRuns(list);
        setSnapshotDate((prev) => prev || list[0]?.snapshotDate || "");
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const options = scopeKind === "country" ? COUNTRIES : REGIONS;
  useEffect(() => {
    if (!options.some(([c]) => c === code)) setCode(options[0][0]);
  }, [scopeKind, options, code]);

  const link = (href: string | undefined, label: string) =>
    href ? (
      <a className="rd-dl" href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    ) : (
      <span className="rd-dl disabled">{label}</span>
    );

  const marketExport = useMemo(
    () => (snapshotDate ? marketUrl(snapshotDate, scopeKind, code, view) : "#"),
    [snapshotDate, scopeKind, code, view]
  );

  if (error) return <div className="rd-center"><h3>Couldn't load snapshots</h3><p>{error}</p></div>;
  if (!runs) return <div className="rd-center"><div className="rd-spinner" /><h3>Loading snapshots…</h3></div>;

  return (
    <>
      <div className="rd-sec-head">
        <h2>Market exports</h2>
        <span className="note">Generate a country or region CSV from a stored snapshot</span>
      </div>
      <div className="rd-slider-bar" style={{ alignItems: "center", gap: 14 }}>
        <div className="rd-period">
          <span className="rd-eyebrow">Snapshot</span>
          <select className="rd-select" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)}>
            {runs.map((r) => (
              <option key={r.snapshotDate} value={r.snapshotDate}>
                {fmtDate(r.snapshotDate)}
              </option>
            ))}
          </select>
        </div>
        <div className="rd-period">
          <span className="rd-eyebrow">Scope</span>
          <div className="rd-chips" style={{ marginBottom: 0 }}>
            <button className={`rd-chip${scopeKind === "country" ? " on" : ""}`} onClick={() => setScopeKind("country")}>
              Country
            </button>
            <button className={`rd-chip${scopeKind === "region" ? " on" : ""}`} onClick={() => setScopeKind("region")}>
              Region
            </button>
          </div>
          <select className="rd-select" value={code} onChange={(e) => setCode(e.target.value)}>
            {options.map(([c, label]) => (
              <option key={c} value={c}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="rd-period">
          <span className="rd-eyebrow">View</span>
          <div className="rd-chips" style={{ marginBottom: 0 }}>
            {["ix", "facility", "combined"].map((v) => (
              <button key={v} className={`rd-chip${view === v ? " on" : ""}`} onClick={() => setView(v)}>
                {v === "ix" ? "IX view" : v === "facility" ? "Facility view" : "Combined"}
              </button>
            ))}
          </div>
        </div>
        <div className="rd-grow" />
        <a className="rd-btn" href={marketExport} target="_blank" rel="noreferrer">
          ↓ Download CSV
        </a>
      </div>
      <div className="rd-footnote" style={{ marginTop: 0, marginBottom: 24 }}>
        IX view is a network-level summary of deployed capacity across the market's exchanges; Facility view is presence
        across its data centres; Combined keeps both record types in one file. Region exports follow the portal's tracked
        metro coverage, not every country in the wider region.
      </div>

      <div className="rd-sec-head">
        <h2>Snapshot files</h2>
        <span className="note">Raw records and per-snapshot CSVs</span>
      </div>
      <div className="rd-dlgrid">
        {runs.map((r) => (
          <Panel key={r.snapshotDate} title={fmtDate(r.snapshotDate)} tag={r.status}>
            <div className="rd-dlmeta rd-num">
              {(r.netCount ?? 0).toLocaleString()} nets · {(r.orgCount ?? 0).toLocaleString()} orgs
            </div>
            <div className="rd-dllinks">
              {link(r.netUrl, "net.jsonl.gz")}
              {link(r.orgUrl, "org.jsonl.gz")}
              {link(r.manifestUrl, "manifest.json")}
              {link(r.networksCsvUrl || csvUrl(r.snapshotDate), "networks.csv")}
              {link(originCountriesUrl(r.snapshotDate), "origin-countries.csv")}
              {link(originNetworksUrl(r.snapshotDate), "origin-networks.csv")}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
