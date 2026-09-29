# School orders payment (production)

**Base:** `https://backend.greenolasa.com/api/v1/school-orders`  
**CORS / return host:** `https://school.greenolasa.com`  
**Widget host:** `eu-prod.oppwa.com` · **Currency:** SAR

## Endpoints

| Method | Path | Role |
|--------|------|------|
| `POST` | `/checkout` | Create order **and** HyperPay session |
| `GET` | `/status?order=&lang=` | Status / paid / pending (never trust URL for paid) |

Request = `buildPayload()` (no client totals, no `x-api-key`).  
Session fields under `response.data`.

## Client package

Build (from `app/`):

```bash
node scripts/pack-client.mjs
```

Outputs:

- `client-upload/` — clean site root
- `greenola-school-app-client.zip` — same, for upload

See `client-upload/UPLOAD.md`.

## Local development (preserved)

- `dev-server.mjs` + `/__school-orders` proxy → **production** API (CORS-safe on localhost)
- Optional `?localMock=1` mocks remain in the working tree only (stripped from the ZIP)

## Apple Pay

UI still offers Apple Pay. Widget brands come from backend `supportedBrands`. **Not verified live** — do not inject `APPLEPAY` without backend confirmation.
