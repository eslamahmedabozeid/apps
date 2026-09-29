# Greenola school parent app — client upload

**Static site only.** Upload these files to the web host. No Node.js, npm, `package.json`, or development proxy is required on the client server.

Production school-orders API (browser calls this directly over HTTPS):
`https://backend.greenolasa.com/api/v1/school-orders`

## What to upload

Unzip `greenola-school-app-client.zip` and publish **all of the following** to the **site root** for `school.greenolasa.com` (same folder level — do not nest under `app/`):

| Path | Required |
|------|----------|
| `index.html` | **Yes** |
| `assets/**` (css, js, fonts, logos, dishes, photos) | **Yes** |
| `_redirects` | If host is Cloudflare Pages (or another host that reads this file) |
| `_headers` | Optional (security headers; Cloudflare Pages) |
| `UPLOAD.md` / `FILES.txt` | Optional (docs only; safe to omit from public root) |

There is **no** `package.json`, `node_modules`, or `npm run` step for production.

## Routing (required)

Parents open `https://school.greenolasa.com/bls` (or `/bls?order=SCH-…`).

Configure a rewrite so a single path segment maps to the app **and preserves the query string**:

| From | To |
|------|----|
| `/{slug}/` | `/{slug}` (optional trailing-slash fix) |
| `/{slug}` | `/?s={slug}` or `/index.html?s={slug}` (**keep** `?order=`, etc.) |

Cloudflare Pages form (included as `_redirects`):

```
/:slug/  /:slug       301
/:slug   /?s=:slug    200
```

If your host ignores `_redirects`, set the same rule in nginx / Apache / Netlify / S3+CloudFront / etc. Without a rewrite, use `https://school.greenolasa.com/?s=bls` instead of `/bls`.

## APIs the hosted app calls (no local proxy)

From `https://school.greenolasa.com` the browser calls:

1. **Menu** — `https://jmtqldgovmmhaystvpdu.supabase.co/functions/v1/school-menu?…`
2. **Checkout / status** — `https://backend.greenolasa.com/api/v1/school-orders/checkout` and `…/status?order=…`
3. **HyperPay widget** — script URL returned in checkout `paymentUrl` (do not rewrite the host)
4. **CDN** — Lucide icons from `cdn.jsdelivr.net` (optional UI icons)

Backend CORS / HyperPay return host must allow `https://school.greenolasa.com`.

## Do not preview with `file://`

Opening `index.html` from disk (`file://…`) is **not** a valid test of the client package:

- Browsers block or restrict `fetch` to HTTPS APIs from a `file://` origin (CORS / opaque origin).
- Clean URLs like `/bls` do not exist on `file://`.
- A toast about not loading data from “this location” is **expected** — it is not a packaging defect.

After upload, smoke-check on the real host (no payment required):

- `https://school.greenolasa.com/bls` — menu loads
- `https://school.greenolasa.com/bls?order=SCH-…` — status uses production `GET …/status`

## Backend contract

- `POST /checkout` — body from `buildPayload()`; **no** client totals; **no** `x-api-key`
- Success: `response.data.paymentUrl`, `checkoutId`, `order_no`, `order_id`, `total`, `vat`, `currency`, `supportedBrands`
- `GET /status?order=&lang=` — UI never treats the URL alone as paid
- Widget: use backend-returned `paymentUrl` as-is (production expects `eu-prod.oppwa.com` + **SAR**)

## Payment methods (honest status)

- **Visa / Mastercard / mada:** brands from `supportedBrands`; widget UI approved. **Live production charge: not verified in this package.**
- **Apple Pay:** UI option only; `APPLEPAY` is not injected unless the backend returns it. **Not verified live.**

## Important

This package was **not** used for a live end-to-end production charge. After upload, run one real payment and share `order_no` with the backend developer.
