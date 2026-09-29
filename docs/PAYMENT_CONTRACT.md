# Frontend HyperPay preparation (`app/` only)

**Status:** Frontend HyperPay preparation complete; awaiting final backend API wiring.

Reference (read-only): `greenola_b2b_landingpage` — UI/widget/brands patterns only.

---

## What is ready in the HTML app

| Area | Implementation |
|------|----------------|
| Methods | Apple Pay / mada / Visa–Mastercard (same brands map as landing page) |
| Order create | Unchanged `POST school-checkout` |
| Session API | Isolated in `assets/school-payment-adapter.js` |
| Loading | `s8` overlay while `createSession` runs |
| Widget | COPYandPAY mount when real `paymentUrl`/`checkoutId` returned; **no** form `action` |
| Return | `?order=SCH-…` → status poll; `?pay=failed` → toast (order not marked paid) |
| Errors / retry | Blocked panel, widget error, pending/failed status actions |
| Mocks | `?payMock=…` — UI only; **never** marks order paid |

---

## Single integration point (update when backend arrives)

**File:** `app/assets/school-payment-adapter.js`

| Step | What to change |
|------|----------------|
| 1 | Set `window.SCHOOL_PAYMENT_SESSION_URL` **or** `SchoolPaymentAdapter.endpoint` to the real session URL |
| 2 | Adjust `buildRequest()` field names to the final contract |
| 3 | Adjust `parseResponse()` if success payload differs from PROVISIONAL shape |
| 4 | Confirm backend sets HyperPay `shopperResultUrl` = `return_url` (`?order=SCH-…`) |
| 5 | Confirm server verifies amount/currency before `paid` |
| 6 | Disable mocks in production (`?payMock` / `SCHOOL_PAYMENT_MOCK`) |

Do **not** send school data to company-subscription checkout.

### PROVISIONAL success fields (same names as landing-page session)

`paymentUrl`, `checkoutId`, optional `supportedBrands` / `orderId`  
(also accepts nested `data.*`)

---

## Mock checks (not real payment tests)

| URL / flag | UI result | Paid? |
|------------|-----------|-------|
| `?payMock=awaiting` | Blocked / awaiting API | No |
| `?payMock=loading` | Loading then awaiting | No |
| `?payMock=session` | Widget chrome preview (no HyperPay script) | No |
| `?payMock=widget-error` | Widget error + retry | No |
| `?payMock=session-error` | Session error panel | No |

Real payment tests require a live session URL + HyperPay + server-side verify.

---

## Files

- `app/index.html` — flow, screens, return/retry
- `app/assets/payment.css` — methods + widget + mock banner
- `app/assets/school-payment-adapter.js` — **only** place for endpoint wiring
- `app/docs/PAYMENT_CONTRACT.md` — this document
