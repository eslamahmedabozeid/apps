# Backend checkout handoff — payload at “Review Order”

**Audience:** backend implementing a POST that accepts school-order data and returns a HyperPay widget script URL (`paymentUrl`).

**Source of truth:** `app/index.html` — `goCart()`, `buildPayload()`, `saveAll()`, `resetPay()`.  
**Not** from `PAYMENT_CONTRACT.md` provisional session fields (those are for a later/adapter step).

**Inspection only.** This document is not a captured network request.

---

## What happens when the user clicks “مراجعة الطلب” / Review Order

1. Button: `onclick="goCart()"` (meals screen → review screen `s6`).
2. **No HTTP request is sent** at this step.
3. Client checks: cart total &gt; 0; optional confirm if some kids have zero meals.
4. UI navigates to review; `resetPay()` **clears** any previously selected `payment_method`.
5. The JSON below is the object `buildPayload()` would produce from in-memory form state **at that moment** (same field names/types used later when paying via today’s `school-checkout`).

`buildPayload()` is also what the app posts today on **Pay** (`POST school-checkout`), after the user picks a payment method. At Review click, `payment_method` is **not** present.

---

## Complete cURL example (constructed from frontend state)

Endpoint not provided by backend yet — placeholder only:

```bash
curl -X POST '<BACKEND_CHECKOUT_ENDPOINT>' \
  -H 'Content-Type: application/json' \
  -d '{
  "school_id": "bls",
  "branch_id": "711bdcdb-c888-45a2-a772-526ae4e6912f",
  "lang": "ar",
  "parent": {
    "name": "Sara Ahmed Alharbi",
    "phone": "551234567"
  },
  "kids": [
    {
      "tmp_id": "k1",
      "name": "Omar Sara Alharbi",
      "grade_idx": 3
    },
    {
      "tmp_id": "k2",
      "name": "Layan Sara Alharbi",
      "grade_idx": 0
    }
  ],
  "lines": [
    {
      "kid_tmp_id": "k1",
      "date": "2026-09-30",
      "item_id": "53383cfc-50a0-40ff-aaea-f425b95d1177",
      "qty": 1
    },
    {
      "kid_tmp_id": "k1",
      "date": "2026-09-30",
      "item_id": "dd35d448-3dbe-420a-a430-50c3a2526503",
      "qty": 1
    },
    {
      "kid_tmp_id": "k1",
      "date": "2026-10-01",
      "item_id": "673b5780-2db0-4166-a408-3334d4b202cb",
      "qty": 1
    },
    {
      "kid_tmp_id": "k2",
      "date": "2026-09-30",
      "item_id": "53383cfc-50a0-40ff-aaea-f425b95d1177",
      "qty": 1
    },
    {
      "kid_tmp_id": "k2",
      "date": "2026-10-04",
      "item_id": "673b5780-2db0-4166-a408-3334d4b202cb",
      "qty": 2
    },
    {
      "kid_tmp_id": "k2",
      "date": "2026-10-04",
      "item_id": "57da86cd-ce47-43e2-a75f-6aeaf66608c6",
      "qty": 1
    }
  ]
}'
```

### Field notes (from implementation)

| Field | Type | Meaning |
|-------|------|---------|
| `school_id` | string | School slug from URL/`?s=` (e.g. `bls`) |
| `branch_id` | string (UUID) \| omitted | Selected branch id; see optional rules below |
| `lang` | `"ar"` \| `"en"` | UI language |
| `parent.name` | string | Parent full name |
| `parent.phone` | string | **9 digits**, Saudi mobile without country code, must match `^5[0-9]{8}$` (e.g. `551234567`). Not `+966…` in this payload |
| `kids[].tmp_id` | string | Client temp id (`k1`, `k2`, …) — join key for lines |
| `kids[].name` | string | Child name (trimmed) |
| `kids[].grade_idx` | number | 0-based index into the app grade list (0=KG/روضة … 13=Grade 12) |
| `lines[].kid_tmp_id` | string | Must match a `kids[].tmp_id` |
| `lines[].date` | string | Delivery date `YYYY-MM-DD` (open dates from `school-menu`) |
| `lines[].item_id` | string (UUID) | Menu item id from `school-menu` (main or addon) |
| `lines[].qty` | number | Positive integer quantity |

**Dummy personal data** above (`Sara…`, `551234567`, child names) is fictional.  
**`school_id` / `branch_id` / `item_id` / sample `date`s** match live `school-menu` for `bls` at the time of writing (menu UUIDs can change if catalog is edited).

**Example line ↔ child relationship:** every `lines[].kid_tmp_id` references `kids[].tmp_id`. One child can have many lines across dates/items.

**`payment_method` is omitted** on purpose: at Review click, `resetPay()` sets `PAY_METHOD = null`, so `buildPayload()` would leave it `undefined` (dropped by `JSON.stringify`). Values used later on Pay: `"apple_pay"` \| `"mada"` \| `"card"`.

---

## Required vs optional (frontend validation)

### Required before the user can reach Review (earlier screens + `goCart`)

| Data | Rule in UI |
|------|------------|
| `parent.name` | Non-empty |
| `parent.phone` | `^5[0-9]{8}$` |
| Each `kids[].name` | At least `min_name_words` words (from school settings, often **2**) |
| Each `kids[].grade_idx` | Selected (not empty string before coerce) |
| `school_id` | Must be set (URL / picker) |
| At least one priced line | `grandTotal() > 0` or Review is blocked |
| Open delivery dates | Menu must expose at least one non-closed date |

### Conditionally required

| Data | Rule |
|------|------|
| `branch_id` | **Required** if the school has **2+** branches. If exactly **1** branch, UI auto-uses it and still includes `branch_id`. If **0** branches, `branch_id` is omitted. |
| Kids with zero meals | Soft: confirm dialog; user may continue with some kids empty |

### Enforced on Pay screen (after Review), not on Review click

| Rule | Notes |
|------|--------|
| Min order | Total ≥ `min_order_total` **or** at least one main dish somewhere (`minOrderOk`) |
| `payment_method` | Must be chosen before Pay; not available at Review |

### Not sent / not available at Review click

| Missing | When it appears |
|---------|-----------------|
| `payment_method` | After user selects Apple Pay / mada / card on review screen |
| `order_no` / `order_id` | Only after a successful create/checkout response |
| `paymentUrl` / `checkoutId` | Payment-session response (proposed below) |
| `return_url` / `shopperResultUrl` | Built later as school page + `?order=SCH-…` |
| Client `total` / `vat` / `currency` in the **request** | **Never sent** by `buildPayload()` — see next section |
| Auth headers / API key | Not used by current school parent app for menu/checkout |

---

## Totals — frontend vs backend

- The UI computes `grandTotal()` from client-side menu prices for display (`#bar6`) and min-order checks.
- **`buildPayload()` does not include `total`, `vat`, `amount`, or `currency`.**
- Comments in `app/index.html`: prices sent at checkout are ignored; **the server prices from the DB**.
- Today’s `school-checkout` response returns `total`, `vat`, `currency`, `order_no`, `order_id` for the client to show/store.

**Backend must calculate and validate the final payable amount** from `lines[].item_id` + `qty` (+ school rules). Do not trust any client-displayed total.

---

## Proposed response (not an agreed contract)

Frontend HyperPay widget needs a full COPYandPAY script URL (`paymentUrl`) and a `checkoutId`. Identifiers help status/return flows.

**Proposed** success body (distinguish from any final OpenAPI):

```json
{
  "paymentUrl": "https://eu-prod.oppwa.com/v1/paymentWidgets.js?checkoutId=EXAMPLE_CHECKOUT_ID",
  "checkoutId": "EXAMPLE_CHECKOUT_ID",
  "order_no": "SCH-20260929-EXAMPLE",
  "order_id": "00000000-0000-0000-0000-000000000000",
  "total": "94.00",
  "vat": "12.26",
  "currency": "SAR",
  "supportedBrands": "VISA MASTER MADA"
}
```

| Field | Status | Frontend use |
|-------|--------|--------------|
| `paymentUrl` | **Proposed** — preferred for widget script `src` | Mount HyperPay |
| `checkoutId` | **Proposed** — required if URL lacks checkoutId | Widget session |
| `order_no` | Used today from `school-checkout` | Status URL `?order=` |
| `order_id` | Optional today | Cache / support |
| `total` / `vat` / `currency` | Returned today by `school-checkout` | Display / cache — **not** request fields |
| `supportedBrands` | Optional / provisional in adapter | Override brands string |

`shopperResultUrl` should be set **server-side** to the school return URL with `order_no` (e.g. `https://school.greenolasa.com/bls?order=SCH-…`). The browser must not set COPYandPAY form `action`.

Auth, path, and exact status codes for `<BACKEND_CHECKOUT_ENDPOINT>` are **not** specified here — await backend contract.

---

## Mapping to current code

| Step | Function | Network? |
|------|----------|----------|
| Review click | `goCart()` | No |
| Payload shape | `buildPayload()` | Used later |
| Pay (today) | `ensureSchoolOrder` → `POST school-checkout` | Yes (existing) |
| HyperPay session (prep) | `SchoolPaymentAdapter.createSession` | Awaiting new endpoint wiring |

If the new endpoint both **creates the order** and **returns `paymentUrl`**, the frontend can later replace the two-step flow; until then this document only describes **request data available at Review** and a **proposed** widget response.

---

## Files

- Implementation: `app/index.html` (`goCart`, `buildPayload`, `saveAll`, `resetPay`, `pay`)
- This handoff: `app/docs/BACKEND_CHECKOUT_HANDOFF.md`
