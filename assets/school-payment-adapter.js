/**
 * LEGACY / UI-mock helper only.
 * Live checkout+session is SchoolOrdersApi (assets/school-orders-api.js) → POST /checkout.
 * Keep this file for ?payMock= previews; do not wire production payments through it.
 */
(function (global) {
  "use strict";

  var PROVISIONAL = true;

  /**
   * Set when backend provides the school payment-session URL.
   * Example: "https://…/functions/v1/school-payment-session"
   * Leave null until the contract is final — do not invent a live path.
   */
  var endpoint =
    (global.SCHOOL_PAYMENT_SESSION_URL &&
      String(global.SCHOOL_PAYMENT_SESSION_URL).trim()) ||
    null;

  function mockMode() {
    try {
      var q = new URLSearchParams(global.location.search).get("payMock");
      if (q) return String(q).trim().toLowerCase();
    } catch (e) {}
    if (global.SCHOOL_PAYMENT_MOCK)
      return String(global.SCHOOL_PAYMENT_MOCK).trim().toLowerCase();
    return null;
  }

  function formatAmount(total) {
    var n = Number(total);
    if (!Number.isFinite(n)) return String(total ?? "");
    return n.toFixed(2);
  }

  /** PROVISIONAL request builder — adjust field names here when backend arrives. */
  function buildRequest(ctx) {
    return {
      order_no: ctx.order_no,
      order_id: ctx.order_id || null,
      amount: formatAmount(ctx.total),
      currency: (ctx.currency || "SAR").toUpperCase(),
      payment_method: ctx.payment_method,
      return_url: ctx.return_url,
      parent: {
        name: ctx.parent && ctx.parent.name,
        phone: ctx.parent && ctx.parent.phone,
      },
      school_id: ctx.school_id || null,
      branch_id: ctx.branch_id || null,
      lang: ctx.lang || "ar",
      _provisional: PROVISIONAL,
    };
  }

  /** PROVISIONAL response parser — matches landing-page session field names. */
  function parseResponse(json) {
    var data =
      json && json.data && typeof json.data === "object" ? json.data : {};
    return {
      paymentUrl: json.paymentUrl || data.paymentUrl || null,
      checkoutId: json.checkoutId || data.checkoutId || null,
      supportedBrands:
        json.supportedBrands ||
        data.supportedBrands ||
        data.paymentBrands ||
        data.brands ||
        null,
      orderId: json.orderId != null ? String(json.orderId) : data.orderId != null ? String(data.orderId) : null,
    };
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Create a HyperPay payment session for an existing school order.
   * @returns {Promise<{
   *   ok: boolean,
   *   mock?: boolean,
   *   previewOnly?: boolean,
   *   code?: string,
   *   error?: string,
   *   paymentUrl?: string|null,
   *   checkoutId?: string|null,
   *   supportedBrands?: string|null,
   *   orderId?: string|null,
   *   provisional?: boolean
   * }>}
   */
  async function createSession(ctx) {
    var mode = mockMode();

    if (mode === "awaiting") {
      return {
        ok: false,
        mock: true,
        provisional: true,
        code: "AWAITING_BACKEND",
        error:
          "MOCK awaiting: payment-session API not wired (frontend preparation).",
      };
    }

    if (mode === "loading") {
      await delay(1200);
      return {
        ok: false,
        mock: true,
        provisional: true,
        code: "AWAITING_BACKEND",
        error: "MOCK loading→awaiting: still no backend session URL.",
      };
    }

    if (mode === "session-error") {
      await delay(400);
      return {
        ok: false,
        mock: true,
        provisional: true,
        code: "MOCK_SESSION_ERROR",
        error: "MOCK session error (not a real payment failure).",
      };
    }

    if (mode === "widget-error" || mode === "session") {
      await delay(300);
      /* previewOnly: UI shows widget chrome; does NOT load HyperPay; NEVER paid */
      return {
        ok: true,
        mock: true,
        previewOnly: true,
        provisional: true,
        paymentUrl: null,
        checkoutId: "MOCK-CHECKOUT-NOT-LIVE",
        supportedBrands:
          ctx.payment_method === "apple_pay"
            ? "APPLEPAY"
            : ctx.payment_method === "mada"
              ? "MADA VISA MASTER"
              : "VISA MASTER MADA",
        orderId: ctx.order_no,
        forceWidgetError: mode === "widget-error",
      };
    }

    if (!endpoint) {
      return {
        ok: false,
        provisional: true,
        code: "AWAITING_BACKEND",
        error:
          "Payment-session endpoint not configured. Set window.SCHOOL_PAYMENT_SESSION_URL when the backend contract is ready.",
      };
    }

    var body = buildRequest(ctx);
    var res;
    var json = {};
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      json = await res.json().catch(function () {
        return {};
      });
    } catch (e) {
      return {
        ok: false,
        provisional: true,
        code: "NET",
        error: "Network error calling payment-session API",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        provisional: true,
        code: json.code || "SESSION_HTTP_" + res.status,
        error: json.error || json.message || "Payment session request failed",
        status: res.status,
      };
    }

    var sess = parseResponse(json);
    if (!sess.paymentUrl && !sess.checkoutId) {
      return {
        ok: false,
        provisional: true,
        code: "SESSION_EMPTY",
        error:
          "Payment session response missing paymentUrl/checkoutId (PROVISIONAL contract)",
      };
    }

    return {
      ok: true,
      provisional: PROVISIONAL,
      paymentUrl: sess.paymentUrl,
      checkoutId: sess.checkoutId,
      supportedBrands: sess.supportedBrands,
      orderId: sess.orderId || ctx.order_no,
    };
  }

  /**
   * Integration checklist for the backend developer / next frontend pass:
   * 1. Set SchoolPaymentAdapter.endpoint or window.SCHOOL_PAYMENT_SESSION_URL
   * 2. Align buildRequest() field names with the final OpenAPI
   * 3. Align parseResponse() with the final success payload
   * 4. Confirm shopperResultUrl = return_url (?order=SCH-…)
   * 5. Confirm server verifies amount/currency before marking paid
   * 6. Remove or ignore ?payMock= in production
   */
  var adapter = {
    provisional: PROVISIONAL,
    get endpoint() {
      return endpoint;
    },
    set endpoint(url) {
      endpoint = url && String(url).trim() ? String(url).trim() : null;
    },
    mockMode: mockMode,
    buildRequest: buildRequest,
    parseResponse: parseResponse,
    createSession: createSession,
  };

  global.SchoolPaymentAdapter = adapter;
})(typeof window !== "undefined" ? window : globalThis);
