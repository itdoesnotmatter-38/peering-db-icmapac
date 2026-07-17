import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DetailView from "./DetailView";
import Shell from "./redesign/Shell";
import OverviewPage from "./redesign/OverviewPage";
import ChangesPage from "./redesign/ChangesPage";
import ExchangePage from "./redesign/ExchangePage";
import ExchangesPage from "./redesign/ExchangesPage";
import NetworkPage from "./redesign/NetworkPage";
import NetworksPage from "./redesign/NetworksPage";
import MetroPage from "./redesign/MetroPage";
import ComparePage from "./redesign/ComparePage";
import RedesignDownloads from "./redesign/DownloadsPage";
import LivePage from "./redesign/LivePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Snapshot-first redesigned views */}
        <Route element={<Shell />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/insights" element={<Navigate to="/" replace />} />
          <Route path="/share" element={<Navigate to="/" replace />} />
          <Route path="/movement" element={<Navigate to="/changes" replace />} />
          <Route path="/changes" element={<ChangesPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/exchanges" element={<ExchangesPage />} />
          <Route path="/exchange/:ixId" element={<ExchangePage />} />
          <Route path="/networks" element={<NetworksPage />} />
          <Route path="/net/:asn" element={<NetworkPage />} />
          <Route path="/metro/:name" element={<MetroPage />} />
          <Route path="/downloads" element={<RedesignDownloads />} />
          <Route path="/live" element={<LivePage />} />
        </Route>

        {/* Legacy entity-detail views kept for old bookmarks; retired from nav */}
        <Route path="/asn/:asn" element={<DetailView />} />
        <Route path="/ix/:ix_id" element={<DetailView />} />
        <Route path="/fac/:fac_id" element={<DetailView />} />
      </Routes>
    </BrowserRouter>
  );
}
