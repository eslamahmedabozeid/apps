# Local UI preview (`app/` only)

## Start

```bash
cd app
npm run dev
# or: node dev-server.mjs
```

Open: **http://127.0.0.1:5173/bls**

## Proxies

| Path | Upstream |
|------|----------|
| `/__dev-api/school-menu…` | Supabase `school-menu` (GET) |
| `/__school-orders/*` | **Production** `https://backend.greenolasa.com/api/v1/school-orders` |

## Limits

- HyperPay **return URL** is `school.greenolasa.com` — payment return will not complete on localhost.
- Mock UI: `?localMock=1` (working tree only; not in client ZIP)

## Client package

```bash
node scripts/pack-client.mjs
```

→ `client-upload/` + `greenola-school-app-client.zip` (production-only, no mocks/proxy).
