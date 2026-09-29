# Vercel preview (school parent app)

## Why landing + B2B admin work on Vercel, but the school app failed

| App | Browser calls | Server/proxy | Why Vercel Origin is OK |
|-----|---------------|--------------|-------------------------|
| `admin-greenola-b2b-netlify` | Supabase **PostgREST** (`company_deals`, etc.) with **anon** key on project `rcijhstzwwuhqiwxtzoa` — see `lib/admin/init.js` | None for data | No `school-menu` Edge Function; anon REST is not origin-gated like school-menu |
| `greenola_b2b_landingpage` | Supabase REST (same B2B project) + **`/api/payment/*`** for checkout | Next.js routes e.g. `app/api/payment/checkout/route.ts` → `fetch(BACKEND_URL…)` **server-side** | Browser never sends Vercel `Origin` to the payment API; the server does |
| School parent `app/` (static) | Direct `https://jmtqldgovmmhaystvpdu.supabase.co/functions/v1/school-menu` | None on production host | Edge Function returns `403 {"code":"ORIGIN"}` for `https://greenola-school-app.vercel.app` |

Local preview already used the proxy pattern: `app/dev-server.mjs` → `/__dev-api/school-menu` forwards GET **without** an `Origin` header (upstream allows no-Origin).

## Preview-only proxies (implemented)

Same idea as the landing payment routes + local `__dev-api` / `__school-orders` proxies:

| Browser path | Upstream | Methods |
|--------------|----------|---------|
| `/api/school-menu` | Supabase `functions/v1/school-menu` | GET |
| `/api/school-orders/checkout` | `backend.greenolasa.com/.../school-orders/checkout` | POST |
| `/api/school-orders/status` | `backend.greenolasa.com/.../school-orders/status` | GET |

- Source under `app/vercel-infra/api/`
- Synced only into `app/vercel-preview/`
- No Origin spoof, no secrets, no open proxy, `Cache-Control: no-store`
- **Not** in `greenola-school-app-client.zip`

Production `school.greenolasa.com` keeps calling school-menu and school-orders **directly**.

## Confirmed Vercel checkout “Network error”

At the time of the failure, browser `fetch` to `https://backend.greenolasa.com/api/v1/school-orders/...` from the preview origin threw `TypeError: Failed to fetch` (client → **Network error**). DevTools showed missing/blocked CORS for the Vercel origin while the request could still reach the backend — so do not blindly retry checkout.

Preview now calls same-origin `/api/school-orders/*` (server-to-server upstream). That removes the browser CORS dependency for checkout/status regardless of backend allowlist changes.

## Deployed preview

- **Stable URL:** https://greenola-school-app.vercel.app  
- **Origin:** `https://greenola-school-app.vercel.app`
- Preview sets `SCHOOL_ORDERS_API_BASE=/api/school-orders` and `API_REMOTE=/api` (menu).

### Connectivity check (no live order)

After deploy, same-origin probes (do **not** replay a real checkout):

- `GET /api/school-orders/status?orderId=…` → upstream JSON (e.g. `ORDER_NOT_FOUND`), `X-Preview-Proxy: school-orders-status`, `Cache-Control: no-store`
- `POST /api/school-orders/checkout` with `{}` → upstream `400` validation errors (proves proxy ↔ backend; creates no order)

```bash
cd app
node scripts/pack-client.mjs          # refresh client-upload if needed
node scripts/sync-vercel-preview.mjs  # static + api proxies + base URL patches
node scripts/deploy-vercel-preview.mjs
```

## Still separate

### Payment return (backend)
HyperPay `shopperResultUrl` is set at checkout by the **payment backend**, typically  
`https://school.greenolasa.com/bls?order=…`.  
Preview UI links may use the Vercel host; **return after pay still goes to production** until backend configures a preview return. Do not claim end-to-end Vercel payment works until that is verified.

### Real payments
Production HyperPay — do not charge from preview without an explicit sandbox path.

## After client approves

```bash
cd app && node scripts/pack-client.mjs
```

ZIP stays static-only for `school.greenolasa.com`.
