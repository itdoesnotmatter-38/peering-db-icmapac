export type PeeringDbParamValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>
  | null
  | undefined;

export type PeeringDbParams = Record<string, PeeringDbParamValue>;

export interface PeeringDbResponse<T> {
  data: T[];
  meta?: any;
  headers: {
    rows: string | null;
    pages: string | null;
    pageSize: string | null;
  };
}

const API_BASE = "/api/peeringdb";

export function buildPeeringDbUrl(obj: string, params: PeeringDbParams = {}): string {
  const search = new URLSearchParams();
  search.set("obj", obj);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        search.append(key, String(entry));
      });
      return;
    }

    search.set(key, String(value));
  });

  return `${API_BASE}?${search.toString()}`;
}

export async function fetchPeeringDb<T>(
  obj: string,
  params: PeeringDbParams = {}
): Promise<PeeringDbResponse<T>> {
  const url = buildPeeringDbUrl(obj, params);
  const resp = await fetch(url);
  const json = await resp.json().catch(() => null);

  if (!resp.ok) {
    const message = json?.error || json?.message || `PeeringDB API error: ${resp.status}`;
    throw new Error(message);
  }

  if (!json || !Array.isArray(json.data)) {
    throw new Error("Invalid response from PeeringDB proxy.");
  }

  return {
    data: json.data,
    meta: json.meta,
    headers: {
      rows: resp.headers.get("x-peeringdb-rows"),
      pages: resp.headers.get("x-peeringdb-pages"),
      pageSize: resp.headers.get("x-peeringdb-page-size"),
    },
  };
}
