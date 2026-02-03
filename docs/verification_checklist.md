# Verification Checklist

- Compare Singapore totals (IXes, facilities, networks) before and after the change.
- In the browser Network tab, confirm requests go to `/api/peeringdb` and not `www.peeringdb.com`.
- Inspect `x-peeringdb-rows` / `x-peeringdb-pages` / `x-peeringdb-page-size` headers for netixlan/netfac calls.
- Run `npm run build` successfully.
- Run `npx vercel dev` and confirm the SG dashboard no longer truncates data and includes facility-only networks.
