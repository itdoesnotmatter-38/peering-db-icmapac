const BASE_URL = process.env.PEERINGDB_API_BASE_URL || "https://www.peeringdb.com/api";
const DEFAULT_LIMIT = 250;
const MAX_RETRIES = Number.parseInt(process.env.PEERINGDB_MAX_RETRIES || "50", 10);
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = Number.parseInt(process.env.PEERINGDB_MAX_DELAY_MS || "120000", 10);
const MAX_RETRY_TIME_MS = Number.parseInt(
  process.env.PEERINGDB_MAX_RETRY_TIME_MS || String(20 * 60 * 1000),
  10
);

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
      return Math.min(seconds * 1000 + 1000, MAX_DELAY_MS);
    }
  }

  const backoff = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(backoff + jitter, MAX_DELAY_MS);
};

const shouldRetry = (status) => status === 429 || status >= 500;

const getErrorMessage = (body, fallback) => {
  const message = body?.error || body?.message || body?.meta?.error || fallback;
  if (typeof message !== "string") return fallback;
  return message;
};

const fetchWithRetry = async (url, options = {}) => {
  const startTime = Date.now();
  const retryLabel = options.retryLabel || "PeeringDB request";
  const fetchOptions = { ...options };
  delete fetchOptions.retryLabel;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const resp = await fetch(url, fetchOptions);
      let body = null;
      if (!resp.ok) {
        body = await resp.json().catch(() => null);
      }

      if (resp.ok || !shouldRetry(resp.status)) {
        return { resp, body };
      }

      const delayMs = getRetryDelayMs(resp, body, attempt);
      const timedOut = Date.now() + delayMs - startTime > MAX_RETRY_TIME_MS;
      if (attempt >= MAX_RETRIES || timedOut) {
        console.warn(
          `${retryLabel} exhausted retries after ${attempt + 1} attempts; returning HTTP ${resp.status}.`
        );
        return { resp, body };
      }

      console.warn(
        `${retryLabel} hit HTTP ${resp.status}; waiting ${Math.round(delayMs / 1000)}s before retry ${
          attempt + 1
        }.`
      );
      await sleep(delayMs);
    } catch (err) {
      const delayMs = getRetryDelayMs(null, null, attempt);
      const timedOut = Date.now() + delayMs - startTime > MAX_RETRY_TIME_MS;
      if (attempt >= MAX_RETRIES || timedOut) {
        throw err;
      }
      console.warn(
        `${retryLabel} failed with ${err?.message || "network error"}; waiting ${Math.round(
          delayMs / 1000
        )}s before retry ${attempt + 1}.`
      );
      await sleep(delayMs);
    }
  }
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
    const { resp, body } = await fetchWithRetry(url, {
      headers,
      retryLabel: `${obj} page ${page + 1} (skip=${skip})`,
    });

    if (!resp.ok) {
      const message = getErrorMessage(body, `HTTP ${resp.status}`);
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
