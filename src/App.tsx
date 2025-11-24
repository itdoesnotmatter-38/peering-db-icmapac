import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PeeringDBDashboard from "./PeeringDBDashboard";
import DetailView from "./DetailView";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PeeringDBDashboard />} />
        <Route path="/asn/:asn" element={<DetailView />} />
        <Route path="/ix/:ix_id" element={<DetailView />} />
        <Route path="/fac/:fac_id" element={<DetailView />} />
      </Routes>
    </BrowserRouter>
  );
}
