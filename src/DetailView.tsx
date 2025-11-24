import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

export default function DetailView() {
  const { asn, ix_id, fac_id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      try {
        if (asn) {
          const resp = await fetch(`https://www.peeringdb.com/api/net?asn=${asn}`);
          const json = await resp.json();
          setData(json.data?.[0] || null);
        }

        if (ix_id) {
          const resp = await fetch(`https://www.peeringdb.com/api/ix?id=${ix_id}`);
          const json = await resp.json();
          setData(json.data?.[0] || null);
        }

        if (fac_id) {
          const resp = await fetch(`https://www.peeringdb.com/api/fac?id=${fac_id}`);
          const json = await resp.json();
          setData(json.data?.[0] || null);
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
