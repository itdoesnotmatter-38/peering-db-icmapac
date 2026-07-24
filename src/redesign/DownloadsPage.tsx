import React, { useEffect, useMemo, useState } from "react";
import { withApiRoot } from "../apiBase";
import { Panel } from "./bits";
import { fmtDate } from "./data";

/* Snapshot downloads, reskinned into the shell. Reads the same endpoints
   as the legacy page: /api/snapshots/latest for the run list, and the
   country/region CSV builders for market exports. Market exports support
   multiple months at once — either one combined CSV (a snapshot_date
   column is prepended, so month-over-month pivots work out of the box)
   or the original per-month files. */

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

function saveBlob(name: string, text: string) {
  const blob = new Blob([text], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function DownloadsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [scopeKind, setScopeKind] = useState<"country" | "region">("country");
  const [code, setCode] = useState("SG");
  const [view, setView] = useState("ix");
  const [busy, setBusy] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exportWarn, setExportWarn] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(withApiRoot("/api/snapshots/latest?limit=12"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (!alive) return;
        const list: Run[] = j.runs || (j.latest ? [j.latest] : []);
        setRuns(list);
        setSelected((prev) => (prev.length ? prev : list[0] ? [list[0].snapshotDate] : []));
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

  const allDates = useMemo(() => (runs || []).map((r) => r.snapshotDate), [runs]);
  /* market exports need a snapshot manifest — older runs without one can't
     build a country/region CSV, so they're offered but not selectable */
  const runByDate = useMemo(() => new Map((runs || []).map((r) => [r.snapshotDate, r])), [runs]);
  const canExport = (d: string) => Boolean(runByDate.get(d)?.manifestUrl);
  const exportableDates = useMemo(() => allDates.filter(canExport), [allDates, runByDate]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleDate = (d: string) => {
    if (!canExport(d)) return;
    setSelected((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...allDates.filter((x) => s.includes(x) || x === d)]));
  };
  const chrono = useMemo(() => [...selected].filter(canExport).sort(), [selected, runByDate]); // eslint-disable-line react-hooks/exhaustive-deps

  /* one combined CSV across the selected months. The market exports already
     carry snapshot_date as their first column, so months concatenate cleanly
     under one header; if a view ever lacks the column, we prepend it. */
  const downloadCombined = async () => {
    if (!chrono.length || busy) return;
    setExportErr(null);
    setExportWarn(null);
    const out: string[] = [];
    const done: string[] = [];
    const skipped: string[] = [];
    try {
      for (let i = 0; i < chrono.length; i++) {
        const d = chrono[i];
        setBusy(`Building… ${i + 1}/${chrono.length}`);
        let lines: string[] = [];
        try {
          const r = await fetch(marketUrl(d, scopeKind, code, view));
          // a month the builder can't produce shouldn't kill the whole export
          if (!r.ok) {
            skipped.push(d);
            continue;
          }
          lines = (await r.text()).split(/\r?\n/).filter((l) => l.length);
        } catch {
          skipped.push(d);
          continue;
        }
        if (lines.length < 2) {
          skipped.push(d);
          continue;
        }
        const hasDateCol = lines[0].toLowerCase().startsWith("snapshot_date");
        if (out.length === 0) out.push(hasDateCol ? lines[0] : `snapshot_date,${lines[0]}`);
        for (let j = 1; j < lines.length; j++) out.push(hasDateCol ? lines[j] : `${d},${lines[j]}`);
        done.push(d);
      }
      if (!done.length) {
        setExportErr(`No export available for the selected month${chrono.length > 1 ? "s" : ""}. Try a more recent snapshot.`);
        return;
      }
      const span = done.length > 1 ? `${done[0]}_to_${done[done.length - 1]}` : done[0];
      saveBlob(`${code}-${view}-${span}.csv`, out.join("\n"));
      if (skipped.length) setExportWarn(`Skipped ${skipped.join(", ")} — no market export available for those snapshots.`);
    } catch (e: any) {
      setExportErr(e?.message || "Export failed");
    } finally {
      setBusy(null);
    }
  };

  /* the original per-month files, fired sequentially */
  const downloadSeparate = async () => {
    if (!chrono.length || busy) return;
    setExportErr(null);
    setExportWarn(null);
    setBusy("Downloading…");
    for (const d of chrono) {
      const a = document.createElement("a");
      a.href = marketUrl(d, scopeKind, code, view);
      a.download = `${code}-${view}-${d}.csv`;
      a.click();
      // small gap so the browser accepts the burst of downloads
      await new Promise((res) => setTimeout(res, 500));
    }
    setBusy(null);
  };

  const link = (href: string | undefined, label: string) =>
    href ? (
      <a className="rd-dl" href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    ) : (
      <span className="rd-dl disabled">{label}</span>
    );

  if (error) return <div className="rd-center"><h3>Couldn't load snapshots</h3><p>{error}</p></div>;
  if (!runs) return <div className="rd-center"><div className="rd-spinner" /><h3>Loading snapshots…</h3></div>;

  return (
    <>
      <div className="rd-sec-head">
        <h2>Market exports</h2>
        <span className="note">Generate country or region CSVs from stored snapshots — pick one month or several</span>
      </div>
      <div className="rd-slider-bar" style={{ alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div className="rd-period" style={{ maxWidth: 430 }}>
          <span className="rd-eyebrow">
            Months · <b className="rd-num" style={{ color: "var(--text)" }}>{selected.length}</b> selected
          </span>
          <div className="rd-chips" style={{ marginBottom: 0 }}>
            <button className="rd-chip" onClick={() => setSelected(exportableDates)}>
              All
            </button>
            <button className="rd-chip" onClick={() => setSelected(exportableDates.slice(0, 1))}>
              Latest only
            </button>
            {runs.map((r) => {
              const ok = canExport(r.snapshotDate);
              return (
                <button
                  key={r.snapshotDate}
                  className={`rd-chip${selected.includes(r.snapshotDate) && ok ? " on" : ""}`}
                  onClick={() => toggleDate(r.snapshotDate)}
                  disabled={!ok}
                  title={ok ? undefined : "No snapshot manifest — market exports aren't available for this month"}
                  style={ok ? undefined : { opacity: 0.45, cursor: "not-allowed" }}
                >
                  {fmtDate(r.snapshotDate)}
                </button>
              );
            })}
          </div>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <button className="rd-btn" onClick={downloadCombined} disabled={!chrono.length || !!busy}>
            {busy || `↓ One combined CSV${chrono.length > 1 ? ` · ${chrono.length} months` : ""}`}
          </button>
          {chrono.length > 1 ? (
            <button className="rd-btn" onClick={downloadSeparate} disabled={!!busy}>
              ↓ {chrono.length} separate files
            </button>
          ) : null}
          {exportErr ? <span style={{ color: "var(--gap)", fontSize: 12, maxWidth: 320, textAlign: "right" }}>{exportErr}</span> : null}
          {exportWarn ? <span style={{ color: "var(--watch)", fontSize: 12, maxWidth: 320, textAlign: "right" }}>{exportWarn}</span> : null}
        </div>
      </div>
      <div className="rd-footnote" style={{ marginTop: 0, marginBottom: 24 }}>
        Select several months and “One combined CSV” stitches them into a single file — the <b>snapshot_date</b> column
        distinguishes the months, ready for month-over-month pivots; “separate files” downloads the original per-month exports (your
        browser may ask once to allow multiple downloads). Months greyed out have no snapshot manifest, so the market
        builder can't produce them — the raw per-snapshot files below are still available for those. IX view is a
        network-level summary of deployed capacity across the market's exchanges; Facility view is presence across its
        data centres; Combined keeps both record types in one file. Region exports follow the portal's tracked metro
        coverage, not every country in the wider region.
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
