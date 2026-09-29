# Greenola school parent app — client upload

Production school-orders API:
`https://backend.greenolasa.com/api/v1/school-orders`

## Upload

1. Unzip `greenola-school-app-client.zip` (or upload the `client-upload/` folder contents).
2. Publish the **contents** to the school site root (Cloudflare Pages project for `school.greenolasa.com`), so that:
   - `index.html` is at the site root
   - `assets/`, `_redirects`, and `_headers` are alongside it
3. Do **not** nest an extra `app/` folder on the host unless your DNS already maps that path.
4. After deploy, smoke-check (no payment required):
   - `https://school.greenolasa.com/bls`
   - `https://school.greenolasa.com/bls?order=SCH-…` (uses `GET https://backend.greenolasa.com/api/v1/school-orders/status`)

## Routing (Cloudflare Pages)

`_redirects` (included):

```
/:slug/  /:slug       301
/:slug   /?s=:slug    200
```

Query strings (e.g. `?order=`) are preserved on the rewrite, so return URLs like `/bls?order=SCH-…` open the status screen and call the production status API.

## Backend contract (unchanged)

- `POST /checkout` — body from `buildPayload()`; **no** client totals; **no** `x-api-key`
- Success: `response.data.paymentUrl`, `checkoutId`, `order_no`, `order_id`, `total`, `vat`, `currency`, `supportedBrands`
- `GET /status?order=&lang=`
- Production widget host: `eu-prod.oppwa.com`; currency: **SAR**
- CORS / return host: `https://school.greenolasa.com`

## Not included (dev-only)

- `dev-server.mjs`, local mocks, payment-adapter mocks, `docs/`, localhost proxy

## Payment methods

- **Card / mada:** integrated via returned `supportedBrands` (typically `VISA MASTER MADA`).
- **Apple Pay:** UI option remains; **not verified live**. Frontend does not inject `APPLEPAY` unless the backend returns it in `supportedBrands`. Confirm with backend before claiming Apple Pay support.

## Important

This package was **not** used for a live end-to-end production charge in packaging. Perform the first real payment manually after upload and share `order_no` with the backend developer.
