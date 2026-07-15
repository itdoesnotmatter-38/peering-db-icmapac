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
import ChangesPage from "./redesign/ChangesPage";
import ExchangePage from "./redesign/ExchangePage";
import NetworkPage from "./redesign/NetworkPage";
import RedesignDownloads from "./redesign/DownloadsPage";
import LivePage from "./redesign/LivePage";

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
          <Route path="/changes" element={<ChangesPage />} />
          <Route path="/exchange/:ixId" element={<ExchangePage />} />
          <Route path="/net/:asn" element={<NetworkPage />} />
          <Route path="/downloads" element={<RedesignDownloads />} />
          <Route path="/live" element={<LivePage />} />
        </Route>

        {/* Legacy full-page views kept for bookmarks; retired from nav */}
        <Route path="/live-classic" element={<PeeringDBDashboard />} />
        <Route path="/downloads-classic" element={<DownloadsPage />} />
        <Route path="/trends" element={<TrendsPage />} />
        <Route path="/asn/:asn" element={<DetailView />} />
        <Route path="/ix/:ix_id" element={<DetailView />} />
        <Route path="/fac/:fac_id" element={<DetailView />} />
      </Routes>
    </BrowserRouter>
  );
}
