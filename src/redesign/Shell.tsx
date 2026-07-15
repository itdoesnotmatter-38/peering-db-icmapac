import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import "./redesign.css";
import { Derived, TrendsResponse, derive, fmtDate, loadTrends } from "./data";
import { Loading, LoadError } from "./bits";

/* ============================================================
   App shell for the redesigned views: left rail, context bar,
   theme toggle, and a shared snapshot-data context so every
   page reads the same loaded-once dataset.
   ============================================================ */

interface SnapshotCtx {
  data: TrendsResponse;
  derived: Derived;
}

const Ctx = createContext<SnapshotCtx | null>(null);

export function useSnapshot(): SnapshotCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSnapshot must be used inside Shell");
  return v;
}

const THEME_KEY = "pdb-theme";

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

const VIEW_META: Record<string, { title: string; desc: string }> = {
  "/": { title: "APAC interconnection overview", desc: "Monthly snapshot baseline — loads instantly, refresh live on demand" },
  "/insights": { title: "Insights", desc: "What moved, what's missing — computed from the last two snapshots" },
  "/share": { title: "Market share", desc: "Equinix share of PeeringDB-visible interconnection" },
  "/movement": { title: "Movement", desc: "Entrants, departures, and upgrades since the last snapshot" },
};

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
  live: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </svg>
  ),
  trends: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 18 9 12l4 3 7-8" />
      <path d="M15 7h5v5" />
    </svg>
  ),
  downloads: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
    </svg>
  ),
};

export default function Shell() {
  const [state, setState] = useState<{ ctx: SnapshotCtx | null; error: string | null }>({ ctx: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const toggleTheme = useTheme();
  const location = useLocation();

  useEffect(() => {
    let alive = true;
    loadTrends()
      .then((data) => {
        if (!alive) return;
        setState({ ctx: { data, derived: derive(data) }, error: null });
      })
      .catch((err) => {
        if (!alive) return;
        setState({ ctx: null, error: err?.message || "Unknown error" });
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const meta = VIEW_META[location.pathname] || VIEW_META["/"];
  const latest = state.ctx?.derived.latest;

  const nextCapture = useMemo(() => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${last.getDate()} ${last.toLocaleString("en", { month: "short" })}`;
  }, []);

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
          <NavLink to="/" end className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            {icons.overview}
            <span>Overview</span>
          </NavLink>
          <NavLink to="/insights" className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            {icons.insights}
            <span>Insights</span>
          </NavLink>
          <NavLink to="/share" className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            {icons.share}
            <span>Market share</span>
          </NavLink>
          <NavLink to="/movement" className={({ isActive }) => `rd-nav-item${isActive ? " active" : ""}`}>
            {icons.movement}
            <span>Movement</span>
          </NavLink>
          <div className="rd-eyebrow rd-nav-label" style={{ marginTop: 14 }}>
            Tools
          </div>
          <Link to="/live" className="rd-nav-item">
            {icons.live}
            <span>Live explore</span>
          </Link>
          <Link to="/trends" className="rd-nav-item">
            {icons.trends}
            <span>Trends</span>
          </Link>
          <Link to="/downloads" className="rd-nav-item">
            {icons.downloads}
            <span>Downloads</span>
          </Link>
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
          {latest ? (
            <span className="rd-pill snap rd-num">
              <span className="dot" />
              <span className="cap">Snapshot</span> {fmtDate(latest)}
            </span>
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
        ) : !state.ctx ? (
          <Loading />
        ) : (
          <Ctx.Provider value={state.ctx}>
            <div className="rd-view">
              <Outlet />
            </div>
          </Ctx.Provider>
        )}
      </div>
    </div>
  );
}
