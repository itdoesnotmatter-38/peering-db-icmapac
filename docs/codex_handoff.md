# Codex handoff — PeeringDB Portal

## Project
- Repo: peeringdb-dashboard (React front-end, Vercel deploy)
- Proxy function: /api/peeringdb (Vercel function)
- Goal: fix inaccurate data, especially SG mismatch, and improve correctness.

## Current state (important)
- Production is deployed on Vercel.
- Front-end calls /api/peeringdb (not direct www.peeringdb.com) in production.
- /api/peeringdb attaches PEERINGDB_API_KEY in server-side function when present.
- There is known mismatch for Singapore (SG) in the portal.

## Hypotheses for SG mismatch
1) Missing pagination for netixlan/netfac (limit/skip) causing truncated results.
2) Facility-only networks (present in netfac, not in netixlan) being dropped because enrichment relies on ASN instead of net_id.
3) SG facility query may be too strict if using country+city; consider using fac?country=SG.

## Desired changes
A) Implement robust pagination and retry/backoff in api/peeringdb.js
   - add a query flag like all=1 to fetch all pages using limit/skip
   - add headers to indicate rows/pages fetched for debugging

B) Update dashboard data-loading logic:
   - use all=1 for netixlan/netfac calls
   - stop silently continuing on failed chunks (surface errors)
   - enrich net objects by id__in (net_id), not only by asn__in
   - consider fac?country=SG instead of country+city for SG

C) Add a short verification checklist
   - Compare SG totals before/after
   - Confirm no direct calls to www.peeringdb.com from browser
   - Confirm x-peeringdb-rows/page headers show full retrieval
   - npm run build passes
   - npx vercel dev works locally

## Commands you may run
- npm install
- npm run build
- npx vercel dev
- (optional) npx vercel --prod once validated
