import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PeeringDBDashboard from "./PeeringDBDashboard";
import DetailView from "./DetailView";
import DownloadsPage from "./DownloadsPage";
import TrendsPage from "./TrendsPage";
import Shell from "./redesign/Shell";
import OverviewPage from "./redesign/OverviewPage";
import InsightsPage from "./redesign/InsightsPage";
import SharePage from "./redesign/SharePage";
import MovementPage from "./redesign/MovementPage";
import ExchangePage from "./redesign/ExchangePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Snapshot-first redesigned views */}
        <Route element={<Shell />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/share" element={<SharePage />} />
          <Route path="/movement" element={<MovementPage />} />
          <Route path="/exchange/:ixId" element={<ExchangePage />} />
        </Route>

        {/* Existing tools, unchanged */}
        <Route path="/live" element={<PeeringDBDashboard />} />
        <Route path="/downloads" element={<DownloadsPage />} />
        <Route path="/trends" element={<TrendsPage />} />
        <Route path="/asn/:asn" element={<DetailView />} />
        <Route path="/ix/:ix_id" element={<DetailView />} />
        <Route path="/fac/:fac_id" element={<DetailView />} />
      </Routes>
    </BrowserRouter>
  );
}
