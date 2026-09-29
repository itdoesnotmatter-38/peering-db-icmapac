import React from "react";

/* Without this, anything thrown while rendering unmounts the whole tree and
   the user gets a blank white page with no clue what happened. Show the error
   instead, and offer to clear the saved settings (scope, watchlist, theme)
   that are the most likely cause of a state-dependent crash. */

interface State {
  error: Error | null;
}

const KEYS = ["pdb-scope", "pdb-theme", "pdb-watchlist-asns"];

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Portal crashed while rendering:", error, info.componentStack);
  }

  clearAndReload = () => {
    try {
      KEYS.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* private mode — nothing to clear */
    }
    window.location.href = window.location.pathname;
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
          maxWidth: 620,
          margin: "70px auto",
          padding: "0 20px",
          color: "#132130",
          lineHeight: 1.55,
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>The portal hit an error</h2>
        <p style={{ color: "#5a6e80", margin: "0 0 16px" }}>
          Something went wrong while drawing this view, so nothing could be shown. The data itself is fine — this is a
          display fault.
        </p>
        <pre
          style={{
            background: "#f4f7fa",
            border: "1px solid #dbe3ec",
            borderRadius: 10,
            padding: "12px 14px",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            overflowX: "auto",
            color: "#d63b50",
          }}
        >
          {error.message || String(error)}
        </pre>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={() => window.location.reload()} style={btn(true)}>
            Reload the page
          </button>
          <button onClick={this.clearAndReload} style={btn(false)}>
            Reset saved settings and reload
          </button>
        </div>
        <p style={{ color: "#8698a8", fontSize: 12, marginTop: 16 }}>
          "Reset saved settings" clears the metro scope, watchlist and theme stored in this browser. It does not touch
          any snapshot data.
        </p>
      </div>
    );
  }
}

const btn = (primary: boolean): React.CSSProperties => ({
  padding: "9px 14px",
  borderRadius: 9,
  border: `1px solid ${primary ? "#0c8da6" : "#c3d0dc"}`,
  background: primary ? "#0c8da6" : "#fff",
  color: primary ? "#fff" : "#132130",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
});
