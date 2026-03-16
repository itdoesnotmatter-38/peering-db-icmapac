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
const MAX_RETRIES = 12;
const BASE_DELAY_MS = 1000;

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

const bodyLooksRetryable = (text = "") => {
  const lower = text.toLowerCase();
  return (
    lower.includes("request was throttled") ||
    lower.includes("expected available in") ||
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("cloudflare")
  );
};

const parseRetryDelayFromBody = (text = "", data = null) => {
  const sources = [
    text,
    typeof data?.message === "string" ? data.message : "",
    typeof data?.error === "string" ? data.error : "",
    typeof data?.detail === "string" ? data.detail : "",
  ].filter(Boolean);

  for (const source of sources) {
    const match = source.match(/Expected available in (\d+)\s*seconds?/i);
    if (match) {
      const seconds = Number.parseInt(match[1], 10);
      if (Number.isFinite(seconds)) {
        return Math.min((seconds + 1) * 1000, 45000);
      }
    }
  }

  return null;
};

const getRetryDelayMs = (response, attempt, text = "", data = null) => {
  const retryAfter = response?.headers?.get?.("retry-after");
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds)) {
      return Math.min(seconds * 1000, 45000);
    }
  }
  const bodyDelay = parseRetryDelayFromBody(text, data);
  if (bodyDelay !== null) {
    return bodyDelay;
  }
  const base = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(base + jitter, 30000);
};

const parseJsonFromText = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const fetchWithRetry = async (url, options = {}) => {
  let attempt = 0;
  let lastError = null;

  while (attempt <= MAX_RETRIES) {
    try {
      const resp = await fetch(url, options);
      const text = await resp.text();
      const data = parseJsonFromText(text);
      const retryable = shouldRetry(resp.status) || (!data && bodyLooksRetryable(text));

      if (!retryable || attempt === MAX_RETRIES) {
        return { resp, data, text };
      }

      await sleep(getRetryDelayMs(resp, attempt, text, data));
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
      const { resp: upstreamResp, data, text } = await fetchWithRetry(upstreamUrl, { headers });

      if (!data) {
        response.status(502).json({
          error: bodyLooksRetryable(text)
            ? text || "PeeringDB request was throttled."
            : "Invalid response from PeeringDB",
        });
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
      const { resp: upstreamResp, data, text } = await fetchWithRetry(upstreamUrl, { headers });

      if (!data || !Array.isArray(data.data)) {
        response.status(502).json({
          error: bodyLooksRetryable(text)
            ? text || "PeeringDB request was throttled."
            : "Invalid response from PeeringDB",
        });
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
