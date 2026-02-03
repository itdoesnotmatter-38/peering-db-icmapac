// api/peeringdb.js
//
// Vercel Serverless Function that proxies requests to the PeeringDB API.
// It reads your PEERINGDB_API_KEY from environment variables (on Vercel)
// and forwards calls like:
//
//   /api/peeringdb?obj=ix&country=SG&city=Singapore
//
// to:
//
//   https://www.peeringdb.com/api/ix?country=SG&city=Singapore
//
// Set all=1 to fetch all pages using limit/skip.

const PEERINGDB_BASE_URL = "https://www.peeringdb.com/api";
const DEFAULT_LIMIT = 250;
const MAX_PAGES = 2000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTruthy = (value) => {
  if (value === undefined || value === null) return false;
  const text = String(value).toLowerCase();
  return text === "1" || text === "true" || text === "yes";
};

const toNumber = (value, fallback) => {
  if (Array.isArray(value)) {
    return toNumber(value[0], fallback);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildUpstreamUrl = (obj, params) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => searchParams.append(key, String(entry)));
      return;
    }
    searchParams.append(key, String(value));
  });

  const qs = searchParams.toString();
  return `${PEERINGDB_BASE_URL}/${encodeURIComponent(obj)}${qs ? `?${qs}` : ""}`;
};

const shouldRetry = (status) => status === 429 || status >= 500;

const getRetryDelayMs = (response, attempt) => {
  const retryAfter = response?.headers?.get?.("retry-after");
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds)) {
      return Math.min(seconds * 1000, 15000);
    }
  }
  const base = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(base + jitter, 8000);
};

const fetchWithRetry = async (url, options = {}) => {
  let attempt = 0;
  let lastError = null;

  while (attempt <= MAX_RETRIES) {
    try {
      const resp = await fetch(url, options);
      if (resp.ok || !shouldRetry(resp.status) || attempt === MAX_RETRIES) {
        return resp;
      }
      await sleep(getRetryDelayMs(resp, attempt));
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES) {
        throw err;
      }
      await sleep(getRetryDelayMs(null, attempt));
    }
    attempt += 1;
  }

  throw lastError || new Error("Failed to reach PeeringDB after retries.");
};

const safeJson = async (resp) => {
  try {
    return await resp.json();
  } catch {
    return null;
  }
};

module.exports = async (request, response) => {
  const apiKey = process.env.PEERINGDB_API_KEY;

  const query = request.query || {};
  const { obj } = query;

  if (!obj || typeof obj !== "string") {
    response
      .status(400)
      .json({ error: "Missing obj query parameter (ix, fac, netixlan, netfac, net, org, ...)" });
    return;
  }

  const wantsAll = isTruthy(query.all);
  const params = { ...query };
  delete params.obj;
  delete params.all;

  const headers = {};
  if (apiKey) {
    headers["Authorization"] = `Api-Key ${apiKey}`;
  }

  try {
    if (!wantsAll) {
      const upstreamUrl = buildUpstreamUrl(obj, params);
      const upstreamResp = await fetchWithRetry(upstreamUrl, { headers });
      const data = await safeJson(upstreamResp);

      if (!data) {
        response.status(502).json({ error: "Invalid response from PeeringDB" });
        return;
      }

      response.setHeader(
        "x-peeringdb-rows",
        Array.isArray(data.data) ? String(data.data.length) : "0"
      );
      response.setHeader("x-peeringdb-pages", "1");
      if (params.limit !== undefined) {
        response.setHeader("x-peeringdb-page-size", String(params.limit));
      }

      response.status(upstreamResp.status).json(data);
      return;
    }

    const limit = Math.max(1, toNumber(params.limit, DEFAULT_LIMIT));
    let skip = Math.max(0, toNumber(params.skip, 0));
    const allData = [];
    let pages = 0;

    while (true) {
      const pageParams = { ...params, limit, skip };
      const upstreamUrl = buildUpstreamUrl(obj, pageParams);
      const upstreamResp = await fetchWithRetry(upstreamUrl, { headers });
      const data = await safeJson(upstreamResp);

      if (!data || !Array.isArray(data.data)) {
        response.status(502).json({ error: "Invalid response from PeeringDB" });
        return;
      }

      if (!upstreamResp.ok) {
        response.status(upstreamResp.status).json(data);
        return;
      }

      allData.push(...data.data);
      pages += 1;

      if (data.data.length < limit) {
        break;
      }

      if (pages >= MAX_PAGES) {
        response.status(500).json({ error: "Pagination limit exceeded while fetching all pages." });
        return;
      }

      skip += limit;
    }

    response.setHeader("x-peeringdb-rows", String(allData.length));
    response.setHeader("x-peeringdb-pages", String(pages));
    response.setHeader("x-peeringdb-page-size", String(limit));

    response.status(200).json({
      data: allData,
      meta: {
        count: allData.length,
        limit,
        skip: 0,
      },
    });
  } catch (err) {
    console.error("Error calling PeeringDB:", err);
    response.status(500).json({ error: "Error contacting PeeringDB" });
  }
};
