const BASE_URL = process.env.PEERINGDB_API_BASE_URL || "https://www.peeringdb.com/api";
const DEFAULT_LIMIT = 250;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildUrl = (obj, params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => search.append(key, String(entry)));
      return;
    }
    search.append(key, String(value));
  });
  const qs = search.toString();
  return `${BASE_URL}/${encodeURIComponent(obj)}${qs ? `?${qs}` : ""}`;
};

const getRetryDelayMs = (resp, body, attempt) => {
  const retryAfter = resp?.headers?.get?.("retry-after");
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds)) {
      return Math.min(seconds * 1000, MAX_DELAY_MS);
    }
  }

  const message = body?.error || body?.message || "";
  const match = message.match(/Expected available in\s+(\d+)\s+seconds/i);
  if (match) {
    const seconds = Number.parseInt(match[1], 10);
    if (Number.isFinite(seconds)) {
      return Math.min(seconds * 1000, MAX_DELAY_MS);
    }
  }

  const backoff = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(backoff + jitter, MAX_DELAY_MS);
};

const shouldRetry = (status) => status === 429 || status >= 500;

const fetchWithRetry = async (url, options = {}) => {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const resp = await fetch(url, options);
      let body = null;
      if (!resp.ok) {
        body = await resp.json().catch(() => null);
      }

      if (resp.ok || !shouldRetry(resp.status) || attempt === MAX_RETRIES) {
        return { resp, body };
      }

      await sleep(getRetryDelayMs(resp, body, attempt));
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES) {
        throw err;
      }
      await sleep(getRetryDelayMs(null, null, attempt));
    }
  }

  throw lastError || new Error("Failed to reach PeeringDB after retries");
};

const fetchAllPages = async ({
  obj,
  params = {},
  apiKey,
  limit = DEFAULT_LIMIT,
  maxPages = 5000,
  onPage,
  pageDelayMs = 150,
}) => {
  let skip = 0;
  let page = 0;
  const headers = {};
  if (apiKey) {
    headers.Authorization = `Api-Key ${apiKey}`;
  }

  while (true) {
    const url = buildUrl(obj, { ...params, limit, skip });
    const { resp, body } = await fetchWithRetry(url, { headers });

    if (!resp.ok) {
      const message = body?.error || body?.message || `HTTP ${resp.status}`;
      throw new Error(`${obj} fetch failed: ${message}`);
    }

    const json = body || (await resp.json().catch(() => null));
    if (!json || !Array.isArray(json.data)) {
      throw new Error(`${obj} invalid response`);
    }

    await onPage(json.data, { page, skip, url });

    if (json.data.length < limit) {
      break;
    }

    page += 1;
    if (page >= maxPages) {
      throw new Error(`${obj} pagination exceeded maxPages=${maxPages}`);
    }

    skip += limit;
    if (pageDelayMs > 0) {
      await sleep(pageDelayMs);
    }
  }
};

module.exports = {
  fetchAllPages,
  buildUrl,
};
