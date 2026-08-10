import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";
import "./redesign.css";
import {
  Derived,
  METRO_CODES,
  TrendsResponse,
  derive,
  filterByMetros,
  fmtDate,
  loadTrends,
  paramToScope,
  scopeLabel,
  scopeToParam,
} from "./data";
import { Loading, LoadError } from "./bits";

/* ============================================================
   App shell: left rail, context bar with the GLOBAL metro-scope
   picker, theme toggle, and a shared snapshot-data context.
   Scope lives in the ?m= URL param (airport codes) so filtered
   views survive navigation and can be shared as links.
   ============================================================ */

interface SnapshotCtx {
  /** Unfiltered dataset — for pages that always need full context (exchange profiles). */
  data: TrendsResponse;
  /** Scope-filtered dataset — what most pages should compute from. */
  scoped: TrendsResponse;
  derived: Derived;
  scope: string[] | null;
  scopeName: string;
  /** Global as-of snapshot date (the time slider). Equals the latest by default. */
  asOf: string;
  isLatestSnapshot: boolean;
  snapshotsAll: string[];
}

const Ctx = createContext<SnapshotCtx | null>(null);

export function useSnapshot(): SnapshotCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSnapshot must be used inside Shell");
  return v;
}

const THEME_KEY = "pdb-theme";
const SCOPE_KEY = "pdb-scope";

function useTheme() {
  const [theme, setTheme] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    try {
      if (theme) window.localStorage.setItem(THEME_KEY, theme);
      else window.localStorage.removeItem(THEME_KEY);
    } catch {
      /* non-fatal */
    }
  }, [theme]);
  const toggle = () => {
    const current =
      theme || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(current === "dark" ? "light" : "dark");
  };
  return toggle;
}

function viewMeta(pathname: string): { title: string; desc: string } {
  if (pathname === "/exchanges") {
    return { title: "Exchanges", desc: "Every exchange in scope — search and open its profile" };
  }
  if (pathname.startsWith("/exchange")) {
    return { title: "Exchange profile", desc: "Snapshot-based view of a single exchange in its metro context" };
  }
  if (pathname === "/networks") {
    return { title: "Networks", desc: "Every network in scope — search by name or ASN and open its profile" };
  }
  if (pathname.startsWith("/net")) {
    return { title: "Network profile", desc: "Snapshot-based footprint of one network across metros, exchanges, and facilities" };
  }
  if (pathname.startsWith("/metro")) {
    return { title: "Metro profile", desc: "Everything in one metro — exchanges, facilities, networks, and Equinix share" };
  }
  if (pathname === "/facilities") {
    return { title: "Data centres", desc: "Every facility in scope — compare who's racked where, or open its profile" };
  }
  if (pathname.startsWith("/fac")) {
    return { title: "Data-centre profile", desc: "Which networks are in one facility, its metro rank, and network-count trend" };
  }
  const map: Record<string, { title: string; desc: string }> = {
    "/": { title: "Interconnection overview", desc: "Monthly snapshot baseline — loads instantly, refresh live on demand" },
    "/changes": { title: "Market changes", desc: "Where the market moved, and which networks shifted capacity on which exchange" },
    "/exclusive": { title: "Exclusive networks", desc: "Networks reachable at only one exchange or data centre in each metro" },
    "/compare": { title: "Analysis", desc: "Multi-network workbench — any networks × metros or exchanges, with facilities and trends" },
    "/downloads": { title: "Downloads", desc: "Snapshot files and country / region market exports" },
    "/live": { title: "Live explore", desc: "Today's PeeringDB ports for one metro, fetched on demand" },
  };
  return map[pathname] || map["/"];
}

/* ---------------- scope picker ---------------- */

function ScopePicker({
  allMetros,
  scope,
  onChange,
}: {
  allMetros: string[];
  scope: string[] | null;
  onChange: (metros: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  /* Local draft so "None → tick a few" works; the empty state is never
     committed to the URL — views always keep at least one metro. */
  const [draft, setDraft] = useState<string[]>(scope || allMetros);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(scope || allMetros);
  }, [scope, allMetros]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commit = (next: string[]) => {
    setDraft(next);
    if (next.length) onChange(next.length === allMetros.length ? null : next);
  };
  const toggleMetro = (metro: string) => {
    commit(draft.includes(metro) ? draft.filter((m) => m !== metro) : [...draft, metro]);
  };

  return (
    <div className="rd-scope" ref={ref}>
      <button className="rd-pill" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="cap">Metros</span> {scopeLabel(scope)}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="rd-scope-pop">
          <div className="rd-scope-presets">
            <button className="rd-chip" onClick={() => commit(allMetros)}>
              Select all
            </button>
            <button className="rd-chip" onClick={() => setDraft([])}>
              None
            </button>
            {!draft.length ? (
              <span className="rd-scope-hint">pick at least one metro</span>
            ) : null}
          </div>
          <div className="rd-scope-grid">
            {allMetros.map((m) => {
              const on = draft.includes(m);
              return (
                <label key={m} className={`rd-scope-item${on ? " on" : ""}`}>
                  <input type="checkbox" checked={on} onChange={() => toggleMetro(m)} />
                  <span className="nm">{m}</span>
                  <span className="rd-cc">{METRO_CODES[m] || ""}</span>
                </label>
              );
            })}
          </div>
          <div className="rd-scope-foot">
            Scope follows you across every tab and lives in the URL — copy the link to share this view.
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- icons ---------------- */

const icons = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  insights: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3a6 6 0 0 0-4 10.5c.8.7 1.3 1.5 1.5 2.5h5c.2-1 .7-1.8 1.5-2.5A6 6 0 0 0 12 3Z" />
      <path d="M9.5 19h5M10.5 21.5h3" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12A9 9 0 1 1 12 3" />
      <path d="M12 3a9 9 0 0 1 9 9h-9z" />
    </svg>
  ),
  movement: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 18 9 12l4 3 7-8" />
      <path d="M15 7h5v5" />
    </svg>
  ),
  changes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  live: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </svg>
  ),
  exchanges: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M4 7l3-3M4 7l3 3M20 17H4M20 17l-3-3M20 17l-3 3" />
    </svg>
  ),
  networks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="5" cy="12" r="2.5" />
      <circle cx="19" cy="5" r="2.5" />
      <circle cx="19" cy="19" r="2.5" />
      <path d="M7.2 11 16.8 6M7.2 13l9.6 5" />
    </svg>
  ),
  downloads: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
    </svg>
  ),
};

export default function Shell() {
  const [state, setState] = useState<{ data: TrendsResponse | null; error: string | null }>({
    data: null,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  const toggleTheme = useTheme();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let alive = true;
    loadTrends()
      .then((data) => alive && setState({ data, error: null }))
      .catch((err) => alive && setState({ data: null, error: err?.message || "Unknown error" }));
    return () => {
      alive = false;
    };
  }, [attempt]);

  /* scope: URL is the source of truth; localStorage seeds the first visit */
  const mParam = searchParams.get("m");
  useEffect(() => {
    if (mParam !== null) return;
    try {
      const saved = window.localStorage.getItem(SCOPE_KEY);
      if (saved) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("m", saved);
            return next;
          },
          { replace: true }
        );
      }
    } catch {
      /* non-fatal */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scope = useMemo(() => paramToScope(mParam), [mParam]);
  const setScope = (metros: string[] | null) => {
    const param = scopeToParam(metros);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (param) next.set("m", param);
        else next.delete("m");
        return next;
      },
      { replace: true }
    );
    try {
      if (param) window.localStorage.setItem(SCOPE_KEY, param);
      else window.localStorage.removeItem(SCOPE_KEY);
    } catch {
      /* non-fatal */
    }
  };

  // Global as-of snapshot for the time slider, stored in the URL as ?at=
  const snapshotsAll = useMemo(
    () => (state.data ? Array.from(new Set(state.data.snapshots)).sort() : []),
    [state.data]
  );
  const latestSnapshot = snapshotsAll[snapshotsAll.length - 1] || "";
  const atParam = searchParams.get("at");
  const asOf = atParam && snapshotsAll.includes(atParam) ? atParam : latestSnapshot;
  const isLatestSnapshot = asOf === latestSnapshot;
  const setAsOf = (date: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (date === latestSnapshot) next.delete("at");
        else next.set("at", date);
        return next;
      },
      { replace: true }
    );
  };

  const ctx = useMemo<SnapshotCtx | null>(() => {
    if (!state.data) return null;
    const scoped = filterByMetros(state.data, scope);
    return {
      data: state.data,
      scoped,
      derived: derive(scoped, asOf || undefined),
      scope,
      scopeName: scopeLabel(scope),
      asOf,
      isLatestSnapshot,
      snapshotsAll,
    };
  }, [state.data, scope, asOf, isLatestSnapshot, snapshotsAll]);

  const meta = viewMeta(location.pathname);
  const latest = ctx?.derived.latest;
  const allMetros = useMemo(
    () => (state.data ? state.data.metros.map((m) => m.key) : []),
    [state.data]
  );

  const nextCapture = useMemo(() => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${last.getDate()} ${last.toLocaleString("en", { month: "short" })}`;
  }, []);

  /* keep ?m= when switching tabs */
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const navTo = (path: string) => ({ pathname: path, search });

  return (
    <div className="rd-app">
      <aside className="rd-rail">
        <div className="rd-brand">
          <svg className="rd-brand-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true">
            <circle cx="17" cy="17" r="15.5" stroke="var(--accent)" strokeOpacity="0.3" />
            <circle cx="17" cy="17" r="10" stroke="var(--accent)" strokeOpacity="0.45" />
            <circle cx="17" cy="17" r="4.5" stroke="var(--accent)" strokeOpacity="0.6" />
            <path d="M17 17 L30 8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="17" cy="17" r="2.4" fill="var(--accent)" />
            <circle cx="26.5" cy="11" r="1.8" fill="var(--present)" />
          </svg>
          <div>
            <div className="rd-brand-name">PeeringDB Dashboard</div>
            <div className="rd-brand-sub">APAC · Interconnect</div>
          </div>
        </div>

        <nav className="rd-nav">
          <div className="rd-eyebrow rd-nav-label">Explore</div>
          <NavLink to={navTo("/")} end className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            {icons.overview}
            <span>Overview</span>
          </NavLink>
          <NavLink to={navTo("/changes")} className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            {icons.changes}
            <span>Market changes</span>
          </NavLink>
          <NavLink to={navTo("/exclusive")} className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            {icons.share}
            <span>Exclusivity</span>
          </NavLink>
          <NavLink to={navTo("/compare")} className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="10" width="4" height="11" rx="1" />
              <rect x="10" y="6" width="4" height="15" rx="1" />
              <rect x="17" y="3" width="4" height="18" rx="1" />
            </svg>
            <span>Analysis</span>
          </NavLink>
          <div className="rd-eyebrow rd-nav-label" style={{ marginTop: 14 }}>
            Directory
          </div>
          <NavLink to={navTo("/exchanges")} className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            {icons.exchanges}
            <span>Exchanges</span>
          </NavLink>
          <NavLink to={navTo("/facilities")} className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            {icons.movement}
            <span>Data centres</span>
          </NavLink>
          <NavLink to={navTo("/networks")} className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            {icons.networks}
            <span>Networks</span>
          </NavLink>
          <div className="rd-eyebrow rd-nav-label" style={{ marginTop: 14 }}>
            Tools
          </div>
          <NavLink to={navTo("/live")} className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            {icons.live}
            <span>Live explore</span>
          </NavLink>
          <NavLink to={navTo("/downloads")} className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            {icons.downloads}
            <span>Downloads</span>
          </NavLink>
        </nav>

        <div className="rd-rail-foot">
          <div className="rd-freshness">
            {latest ? (
              <>
                Snapshot <b>{fmtDate(latest)}</b>
                <br />
                next capture {nextCapture} · SGT
              </>
            ) : (
              "Loading snapshot…"
            )}
          </div>
          <button className="rd-theme-btn" onClick={toggleTheme}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="4.5" />
              <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
            </svg>
            <span>Theme</span>
          </button>
        </div>
      </aside>

      <div className="rd-main">
        <div className="rd-context">
          <div className="rd-ctx-title">
            <div className="t">{meta.title}</div>
            <div className="d">{meta.desc}</div>
          </div>
          <div className="rd-grow" />
          {allMetros.length ? <ScopePicker allMetros={allMetros} scope={scope} onChange={setScope} /> : null}
          {snapshotsAll.length ? (
            <div className={`rd-time${isLatestSnapshot ? "" : " hist"}`} title={isLatestSnapshot ? "Viewing the latest snapshot — drag to look back in time" : "Viewing history — every page renders as of this date"}>
              <span className="cap">{isLatestSnapshot ? "Snapshot" : "As of"}</span>
              <input
                type="range"
                min={0}
                max={snapshotsAll.length - 1}
                step={1}
                value={snapshotsAll.indexOf(asOf)}
                onChange={(e) => setAsOf(snapshotsAll[Number(e.target.value)])}
                aria-label="As-of snapshot"
              />
              <b className="rd-num">{fmtDate(asOf)}</b>
              {isLatestSnapshot ? (
                <span className="dot" />
              ) : (
                <button className="rd-time-x" onClick={() => setAsOf(latestSnapshot)} title="Back to latest">
                  ✕
                </button>
              )}
            </div>
          ) : null}
          <Link to="/live" className="rd-btn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
            </svg>
            Live explore
          </Link>
        </div>

        {state.error ? (
          <LoadError message={state.error} onRetry={() => setAttempt((a) => a + 1)} />
        ) : !ctx ? (
          <Loading />
        ) : (
          <Ctx.Provider value={ctx}>
            <div className="rd-view">
              <Outlet />
            </div>
          </Ctx.Provider>
        )}
      </div>
    </div>
  );
}
