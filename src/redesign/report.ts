import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Derived,
  TrendsResponse,
  exchangesRanking,
  facilitiesDirectory,
  fmtDate,
  ixExclusivesByMetro,
  networkProfile,
  networksDirectory,
} from "./data";

/* Designed PDF report, generated client-side — no print dialog, always in
   colour. Landscape A4 to suit the wide tables; every page carries a header
   rule and a footer with scope, snapshot and page number. */

const C = {
  text: [19, 33, 48] as [number, number, number],
  muted: [90, 110, 128] as [number, number, number],
  faint: [134, 152, 168] as [number, number, number],
  line: [219, 227, 236] as [number, number, number],
  accent: [12, 141, 166] as [number, number, number],
  accentSoft: [225, 242, 246] as [number, number, number],
  equinix: [108, 76, 224] as [number, number, number],
  equinixSoft: [237, 232, 253] as [number, number, number],
  up: [27, 156, 85] as [number, number, number],
  down: [214, 59, 80] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const W = 297;
const H = 210;
const M = 14;

/* jsPDF's built-in fonts are WinAnsi only — characters outside it (Δ U+0394,
   the true minus U+2212, ✓, …) silently fall back to UTF-16 and render as
   garbage, so every string written to the PDF goes through safe(). */
const safe = (s: string) =>
  s
    .replace(/\u2212/g, "-")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u0394/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2192/g, "->")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\u0000-\u00ff]/g, "");

const tLbl = (t: number) => (t >= 1 ? `${t.toFixed(1)}T` : t > 0.0005 ? `${(t * 1000).toFixed(0)}G` : "-");
const dTLbl = (t: number) =>
  Math.abs(t) < 0.005 ? "·" : `${t > 0 ? "+" : "-"}${Math.abs(t) >= 1 ? `${Math.abs(t).toFixed(1)}T` : `${(Math.abs(t) * 1000).toFixed(0)}G`}`;
const ppLbl = (v: number) => (Math.abs(v) < 0.05 ? "·" : `${v > 0 ? "+" : "-"}${Math.abs(v).toFixed(1)}pp`);

export interface ReportOpts {
  data: TrendsResponse;
  scoped: TrendsResponse;
  derived: Derived;
  scopeName: string;
  asOf: string;
  /** networks to deep-dive; falls back to the biggest in scope */
  networks?: number[];
}

export function buildReport({ data, scoped, derived, scopeName, asOf, networks }: ReportOpts) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const latest = derived.latest;
  const stamp = `${scopeName} · snapshot ${fmtDate(latest)}`;
  let page = 0;

  const T = (txt: string, x: number, y: number, opts?: any) => doc.text(safe(txt), x, y, opts);
  // table cells go through the same WinAnsi guard as free text
  const clean = (d: any) => {
    if (Array.isArray(d.cell?.text)) d.cell.text = d.cell.text.map((t: any) => safe(String(t)));
  };

  const chrome = (title?: string) => {
    page += 1;
    if (title) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...C.text);
      T(title, M, M + 2);
      doc.setDrawColor(...C.line);
      doc.setLineWidth(0.4);
      doc.line(M, M + 5, W - M, M + 5);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.faint);
    T(`PeeringDB Dashboard · ${stamp}`, M, H - 7);
    T(`${page}`, W - M, H - 7, { align: "right" });
  };

  /* ---------- 1 · cover + market summary ---------- */
  doc.setFillColor(...C.text);
  doc.rect(0, 0, W, 46, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...C.white);
  T("Interconnection report", M, 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 214, 226);
  T(`${scopeName}  ·  snapshot ${fmtDate(latest)}  ·  generated ${new Date().toISOString().slice(0, 10)}`, M, 33);
  doc.setFontSize(8);
  T("PeeringDB Dashboard — APAC · Interconnect", W - M, 33, { align: "right" });

  // headline KPIs
  const kpis: Array<[string, string, string]> = [
    ["Deployed capacity", `${derived.totals.capT.toFixed(1)} Tbps`, dTLbl(derived.deltas.capT) + " vs prev"],
    ["Unique networks", derived.totals.nets.toLocaleString(), `${derived.deltas.nets >= 0 ? "+" : "−"}${Math.abs(derived.deltas.nets)}`],
    ["Exchanges", String(derived.totals.ix), `${derived.deltas.ix >= 0 ? "+" : "−"}${Math.abs(derived.deltas.ix)}`],
    ["Facilities", String(derived.totals.fac), `${derived.deltas.fac >= 0 ? "+" : "−"}${Math.abs(derived.deltas.fac)}`],
    ["Equinix IX share", `${derived.share.apacPct.toFixed(1)}%`, "of listed IX capacity"],
  ];
  const kw = (W - M * 2 - 4 * 4) / 5;
  kpis.forEach(([label, value, sub], i) => {
    const x = M + i * (kw + 4);
    doc.setDrawColor(...C.line);
    doc.setFillColor(...C.white);
    doc.roundedRect(x, 56, kw, 24, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.faint);
    T(label.toUpperCase(), x + 4, 62);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...C.text);
    T(value, x + 4, 71);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    T(sub, x + 4, 76.5);
  });

  // top metros — horizontal bars with the Equinix share overlaid
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C.text);
  T("Metros by deployed capacity", M, 92);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  T("bar = total listed IX capacity · violet = Equinix share of it", M + 62, 92);

  const tops = derived.metros.slice(0, 10);
  const maxCap = tops[0]?.capT || 1;
  const barX = M + 34;
  const barW = W - M * 2 - 34 - 44;
  tops.forEach((m, i) => {
    const y = 99 + i * 9.4;
    const shareRow = derived.share.byMetro.find((s) => s.metro === m.metro);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.text);
    T(m.metro.length > 16 ? `${m.metro.slice(0, 15)}…` : m.metro, M, y + 3.4);
    const w = Math.max(1, (m.capT / maxCap) * barW);
    doc.setFillColor(...C.accentSoft);
    doc.roundedRect(barX, y, w, 5, 1, 1, "F");
    if (shareRow && shareRow.pct > 0) {
      doc.setFillColor(...C.equinix);
      doc.roundedRect(barX, y, Math.max(1, w * (shareRow.pct / 100)), 5, 1, 1, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.text);
    T(`${m.capT.toFixed(1)}T`, barX + barW + 4, y + 3.6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.muted);
    doc.setFontSize(7);
    T(`${shareRow ? shareRow.pct.toFixed(0) : 0}% EQX · ${m.nets} nets`, barX + barW + 18, y + 3.6);
  });
  chrome();

  /* ---------- 2 · exchange league table ---------- */
  doc.addPage();
  chrome("Exchanges by deployed capacity");
  const ix = exchangesRanking(scoped, latest).slice(0, 22);
  autoTable(doc, {
    startY: M + 9,
    head: [["#", "Exchange", "Metro", "Capacity", "MoM chg", "QoQ chg", "Metro share", "Share chg", "Nets"]],
    body: ix.map((x, i) => [
      String(i + 1),
      x.name.length > 34 ? `${x.name.slice(0, 33)}…` : x.name,
      x.metro,
      tLbl(x.capT),
      dTLbl(x.dCapT),
      dTLbl(x.dCapQ),
      `${x.metroSharePct.toFixed(0)}%`,
      ppLbl(x.dSharePP),
      String(x.nets),
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.6, cellPadding: 1.6, textColor: C.text, lineColor: C.line, lineWidth: 0.1 },
    headStyles: { fillColor: C.text, textColor: C.white, fontSize: 7, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 8, textColor: C.faint },
      3: { halign: "right", fontStyle: "bold" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right", textColor: C.muted },
    },
    didParseCell: (d) => {
      clean(d);
      const row = ix[d.row.index];
      if (d.section !== "body" || !row) return;
      if (row.isEquinix) {
        d.cell.styles.fillColor = C.equinixSoft;
        if (d.column.index === 1) d.cell.styles.textColor = C.equinix;
        if (d.column.index === 1) d.cell.styles.fontStyle = "bold";
      }
      const val = [null, null, null, null, row.dCapT, row.dCapQ, null, row.dSharePP, null][d.column.index];
      if (typeof val === "number" && Math.abs(val) > 0.005) d.cell.styles.textColor = val > 0 ? C.up : C.down;
    },
  });

  /* ---------- 3 · network deep-dive ---------- */
  const dir = networksDirectory(scoped, latest);
  const picks = (networks && networks.length ? networks : dir.slice(0, 4).map((n) => n.asn)).slice(0, 4);
  picks.forEach((asn) => {
    const p = networkProfile(data, asn, asOf);
    if (!p.found) return;
    doc.addPage();
    chrome(`${p.name} · AS${p.asn}`);
    let y = M + 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    T(
      `${p.totalCapT.toFixed(1)} Tbps deployed · ${p.metroCount} metros · ${p.ixCount} exchange ports · ${p.facCount} facility presences`,
      M,
      y
    );
    y += 7;

    // allocation across exchanges, grouped by metro
    const scopeMetros = new Set(derived.metros.map((m) => m.metro));
    const ports = p.ports.filter((x) => scopeMetros.has(x.metro)).sort((a, b) => b.capG - a.capG);
    const maxPort = ports[0]?.capG || 1;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...C.text);
    T("Capacity allocation across exchanges", M, y);
    y += 5;
    const bx = M + 62;
    const bw = W - M * 2 - 62 - 34;
    ports.slice(0, 12).forEach((port) => {
      const totMetro = ports.filter((x) => x.metro === port.metro).reduce((a, x) => a + x.capG, 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.6);
      doc.setTextColor(...(port.isEquinix ? C.equinix : C.text));
      const nm = port.ixName.length > 26 ? `${port.ixName.slice(0, 25)}…` : port.ixName;
      T(nm, M, y + 3.2);
      doc.setTextColor(...C.faint);
      doc.setFontSize(6.6);
      T(port.metro.length > 12 ? port.metro.slice(0, 11) : port.metro, M + 44, y + 3.2);
      const w = Math.max(0.8, (port.capG / maxPort) * bw);
      doc.setFillColor(...(port.isEquinix ? C.equinix : C.accent));
      doc.roundedRect(bx, y, w, 4.4, 0.8, 0.8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.6);
      doc.setTextColor(...C.text);
      T(port.capG >= 1000 ? `${(port.capG / 1000).toFixed(1)}T` : `${port.capG.toFixed(0)}G`, bx + bw + 4, y + 3.3);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.muted);
      T(totMetro > 0 ? `${((port.capG / totMetro) * 100).toFixed(0)}% of ${port.metro.slice(0, 9)}` : "", bx + bw + 15, y + 3.3);
      y += 6;
    });
    if (!ports.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...C.muted);
      T("No listed exchange ports in the selected metros.", M, y + 3);
      y += 8;
    }

    // metro footprint table
    const fp = p.footprint.filter((f) => scopeMetros.has(f.metro));
    if (fp.length) {
      autoTable(doc, {
        startY: Math.min(y + 3, H - 50),
        head: [["Metro", "Capacity", "Exchanges", "Data centres"]],
        body: fp.map((f) => [f.metro, `${f.capT.toFixed(1)}T`, String(f.ixCount), String(f.facCount)]),
        theme: "grid",
        styles: { font: "helvetica", fontSize: 7.4, cellPadding: 1.4, textColor: C.text, lineColor: C.line, lineWidth: 0.1 },
        headStyles: { fillColor: C.text, textColor: C.white, fontSize: 6.8 },
        columnStyles: { 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" }, 3: { halign: "right" } },
        didParseCell: clean,
        tableWidth: 110,
        margin: { left: M },
      });
    }
  });

  /* ---------- 4 · data centres & exclusivity ---------- */
  doc.addPage();
  chrome("Data centres by network presence");
  const facs = facilitiesDirectory(scoped, latest);
  const eqxFacs = facs.filter((f) => f.isEquinix);
  const eqxNets = eqxFacs.reduce((a, f) => a + f.nets, 0);
  const allNets = facs.reduce((a, f) => a + f.nets, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  T(
    `${facs.length} data centres in scope · Equinix operates ${eqxFacs.length} of them, holding ${
      allNets ? ((eqxNets / allNets) * 100).toFixed(1) : "0"
    }% of all listed network presences`,
    M,
    M + 12
  );
  autoTable(doc, {
    startY: M + 16,
    head: [["#", "Data centre", "Operator", "Metro", "Networks", "MoM chg", "Metro share", "Rank"]],
    body: facs.slice(0, 20).map((f, i) => [
      String(i + 1),
      f.name.length > 34 ? `${f.name.slice(0, 33)}…` : f.name,
      f.isEquinix ? "Equinix" : f.org.length > 20 ? `${f.org.slice(0, 19)}…` : f.org,
      f.metro,
      String(f.nets),
      f.dNets === 0 ? "·" : `${f.dNets > 0 ? "+" : "−"}${Math.abs(f.dNets)}`,
      `${f.metroSharePct.toFixed(1)}%`,
      `#${f.metroRank}`,
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.6, cellPadding: 1.6, textColor: C.text, lineColor: C.line, lineWidth: 0.1 },
    headStyles: { fillColor: C.text, textColor: C.white, fontSize: 7, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 8, textColor: C.faint },
      4: { halign: "right", fontStyle: "bold" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right", textColor: C.muted },
    },
    didParseCell: (d) => {
      clean(d);
      const row = facs[d.row.index];
      if (d.section !== "body" || !row) return;
      if (row.isEquinix) {
        d.cell.styles.fillColor = C.equinixSoft;
        if (d.column.index === 1) {
          d.cell.styles.textColor = C.equinix;
          d.cell.styles.fontStyle = "bold";
        }
      }
      if (d.column.index === 5 && row.dNets !== 0) d.cell.styles.textColor = row.dNets > 0 ? C.up : C.down;
    },
  });

  // exclusivity — networks reachable at only one exchange per metro
  doc.addPage();
  chrome("Exclusive networks — reachable at only one exchange in the metro");
  const excl = ixExclusivesByMetro(scoped, latest);
  const rows: Array<[string, string, string, string, string]> = [];
  derived.metros.forEach((m) => {
    const list = (excl.get(m.metro) || []).slice(0, 4);
    list.forEach((r, i) => {
      rows.push([
        i === 0 ? m.metro : "",
        r.name.length > 30 ? `${r.name.slice(0, 29)}…` : r.name,
        String(r.exclusives.length),
        String(r.members),
        r.members ? `${((r.exclusives.length / r.members) * 100).toFixed(0)}%` : "—",
      ]);
    });
  });
  autoTable(doc, {
    startY: M + 9,
    head: [["Metro", "Exchange", "Exclusive networks", "Members", "% exclusive"]],
    body: rows,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.6, cellPadding: 1.6, textColor: C.text, lineColor: C.line, lineWidth: 0.1 },
    headStyles: { fillColor: C.text, textColor: C.white, fontSize: 7, fontStyle: "bold" },
    columnStyles: {
      0: { fontStyle: "bold" },
      2: { halign: "right", fontStyle: "bold" },
      3: { halign: "right", textColor: C.muted },
      4: { halign: "right" },
    },
    didParseCell: (d) => {
      clean(d);
      if (d.section === "body" && d.column.index === 1 && /equinix/i.test(String(d.cell.raw))) {
        d.cell.styles.textColor = C.equinix;
        d.cell.styles.fontStyle = "bold";
      }
    },
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.faint);
  T(
    "Exclusive = present at only one exchange within that metro; route-server ASNs excluded. PeeringDB is self-reported — read as listed presence, not certain live traffic.",
    M,
    H - 12
  );

  doc.save(`peeringdb-report-${latest}.pdf`);
}
