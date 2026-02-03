import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPeeringDb } from "./peeringdbApi";

export default function DetailView() {
  const { asn, ix_id, fac_id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      try {
        if (asn) {
          const { data: nets } = await fetchPeeringDb<any>("net", { asn });
          setData(nets?.[0] || null);
        }

        if (ix_id) {
          const { data: ixs } = await fetchPeeringDb<any>("ix", { id: ix_id });
          setData(ixs?.[0] || null);
        }

        if (fac_id) {
          const { data: facs } = await fetchPeeringDb<any>("fac", { id: fac_id });
          setData(facs?.[0] || null);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [asn, ix_id, fac_id]);

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;
  if (!data) return <div style={{ padding: 20 }}>No data found.</div>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Detail View</h1>
      <pre style={{ color: "white", background: "#111", padding: 20 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
