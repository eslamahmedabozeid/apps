#!/usr/bin/env node
/**
 * Local UI preview server for app/ only.
 *
 * - Serves static files + /{school-slug} → index.html
 * - /__dev-api/* → Supabase school-menu (GET, no Origin forwarded)
 * - /__school-orders/* → production school-orders API (GET status + POST checkout, no Origin)
 *   HyperPay return URL is school.greenolasa.com — localhost return flow is incomplete.
 *
 * Start:  node dev-server.mjs
 * Open:   http://127.0.0.1:5173/bls
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || "127.0.0.1";
const UPSTREAM =
  process.env.SCHOOL_API_UPSTREAM ||
  "https://jmtqldgovmmhaystvpdu.supabase.co/functions/v1";
const SCHOOL_ORDERS_UPSTREAM =
  process.env.SCHOOL_ORDERS_UPSTREAM ||
  "https://backend.greenolasa.com/api/v1/school-orders";

const MENU_READ_ALLOW = new Set(["school-menu", "school-order-status"]);
const ORDERS_ALLOW = new Set(["checkout", "status"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(raw);
}

function safeJoin(root, rel) {
  const resolved = path.resolve(root, rel);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

function isSchoolSlug(seg) {
  return (
    /^[a-z0-9-]{2,32}$/.test(seg) &&
    ![
      "assets",
      "docs",
      "api",
      "admin",
      "app",
      "__dev-api",
      "__school-orders",
    ].includes(seg)
  );
}

function resolveStatic(pathname) {
  let p = decodeURIComponent(pathname.split("?")[0] || "/");
  if (p.includes("\0") || p.includes("..")) return null;
  if (p === "/" || p === "/index.html") return "index.html";
  if (p.startsWith("/assets/") || p.startsWith("/docs/")) return p.slice(1);
  const segs = p.split("/").filter(Boolean);
  if (segs.length === 1 && isSchoolSlug(segs[0].toLowerCase())) {
    return "index.html";
  }
  if (segs.length === 1 && segs[0] === "favicon.ico") return null;
  if (segs.length === 1 && !segs[0].startsWith(".")) return segs[0];
  return null;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function handleMenuProxy(req, res, restPath) {
  const qIndex = restPath.indexOf("?");
  const fnPath = qIndex >= 0 ? restPath.slice(0, qIndex) : restPath;
  const query = qIndex >= 0 ? restPath.slice(qIndex) : "";
  const fnName = fnPath.split("/").filter(Boolean)[0] || "";

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, accept",
    });
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 403, {
      error: "Menu proxy is read-only.",
      error_ar: "بروكسي المنيو للقراءة فقط.",
      code: "LOCAL_READONLY",
    });
    return;
  }

  if (!MENU_READ_ALLOW.has(fnName)) {
    sendJson(res, 403, {
      error: `Function "${fnName}" is not allowed on menu proxy.`,
      code: "LOCAL_READONLY",
    });
    return;
  }

  const target = `${UPSTREAM}/${fnPath}${query}`;
  let upstream;
  try {
    upstream = await fetch(target, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "greenola-school-app-local-preview/1.0",
      },
      redirect: "follow",
    });
  } catch (e) {
    sendJson(res, 502, {
      error: "Upstream school-menu unreachable from local proxy",
      code: "PROXY_UPSTREAM",
      detail: String(e && e.message ? e.message : e),
    });
    return;
  }

  const text = await upstream.text();
  const ct =
    upstream.headers.get("content-type") || "application/json; charset=utf-8";
  res.writeHead(upstream.status, {
    "Content-Type": ct,
    "Cache-Control": "no-store",
    "X-Local-Proxy": "school-menu-readonly",
  });
  if (req.method === "HEAD") res.end();
  else res.end(text);
}

async function handleSchoolOrdersProxy(req, res, restPath) {
  const qIndex = restPath.indexOf("?");
  const fnPath = (qIndex >= 0 ? restPath.slice(0, qIndex) : restPath).replace(
    /^\/+/,
    ""
  );
  const query = qIndex >= 0 ? restPath.slice(qIndex) : "";
  const fnName = fnPath.split("/").filter(Boolean)[0] || "";

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, accept",
    });
    res.end();
    return;
  }

  if (!ORDERS_ALLOW.has(fnName)) {
    sendJson(res, 403, {
      error: `Path "${fnName}" is not allowed on school-orders proxy.`,
      code: "LOCAL_READONLY",
    });
    return;
  }

  if (fnName === "status" && req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "status is GET only", code: "METHOD" });
    return;
  }
  if (fnName === "checkout" && req.method !== "POST") {
    sendJson(res, 405, { error: "checkout is POST only", code: "METHOD" });
    return;
  }

  const target = `${SCHOOL_ORDERS_UPSTREAM}/${fnPath}${query}`;
  const headers = {
    Accept: "application/json",
    "User-Agent": "greenola-school-app-local-preview/1.0",
  };
  let body;
  if (req.method === "POST") {
    body = await readBody(req);
    headers["Content-Type"] =
      req.headers["content-type"] || "application/json";
  }

  let upstream;
  try {
    /* Omit browser Origin — DEV CORS allowlist is school.greenolasa.com. */
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: body && body.length ? body : undefined,
      redirect: "follow",
    });
  } catch (e) {
    sendJson(res, 502, {
      error: "Upstream school-orders unreachable from local proxy",
      code: "PROXY_UPSTREAM",
      detail: String(e && e.message ? e.message : e),
    });
    return;
  }

  const text = await upstream.text();
  const ct =
    upstream.headers.get("content-type") || "application/json; charset=utf-8";
  res.writeHead(upstream.status, {
    "Content-Type": ct,
    "Cache-Control": "no-store",
    "X-Local-Proxy": "school-orders-dev",
  });
  if (req.method === "HEAD") res.end();
  else res.end(text);
}

function handleStatic(req, res, pathname) {
  const rel = resolveStatic(pathname);
  if (!rel) {
    sendJson(res, 404, { error: "Not found", path: pathname });
    return;
  }
  const file = safeJoin(ROOT, rel);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    sendJson(res, 404, { error: "Not found", path: pathname });
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=60",
  });
  if (req.method === "HEAD") res.end();
  else fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `${HOST}:${PORT}`;
    const u = new URL(req.url || "/", `http://${host}`);
    const pathname = u.pathname;

    if (pathname === "/__dev-api" || pathname === "/__dev-api/") {
      sendJson(res, 200, {
        ok: true,
        mode: "local-preview",
        menuUpstream: UPSTREAM,
        schoolOrdersUpstream: SCHOOL_ORDERS_UPSTREAM,
        note: "Menu GET via /__dev-api; checkout/status via /__school-orders.",
      });
      return;
    }

    if (pathname.startsWith("/__dev-api/")) {
      const rest = pathname.slice("/__dev-api/".length) + u.search;
      await handleMenuProxy(req, res, rest);
      return;
    }

    if (pathname === "/__school-orders" || pathname === "/__school-orders/") {
      sendJson(res, 200, {
        ok: true,
        upstream: SCHOOL_ORDERS_UPSTREAM,
        allow: [...ORDERS_ALLOW],
        returnUrlHost: "school.greenolasa.com",
      });
      return;
    }

    if (pathname.startsWith("/__school-orders/")) {
      const rest = pathname.slice("/__school-orders/".length) + u.search;
      await handleSchoolOrdersProxy(req, res, rest);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end("Method Not Allowed");
      return;
    }

    handleStatic(req, res, pathname);
  } catch (e) {
    console.error("[dev-server]", e);
    sendJson(res, 500, { error: "Local server error", code: "DEV_SERVER" });
  }
});

server.listen(PORT, HOST, () => {
  const base = `http://${HOST}:${PORT}`;
  console.log("");
  console.log("Greenola school app — local UI preview");
  console.log(`  Root:     ${base}/`);
  console.log(`  BLS:      ${base}/bls`);
  console.log(`  Menu:     ${base}/__dev-api/school-menu?list=1&lang=ar`);
  console.log(`  Orders:   ${base}/__school-orders/ → ${SCHOOL_ORDERS_UPSTREAM}`);
  console.log(`  Mock UI:  ${base}/bls?localMock=1`);
  console.log(
    "  Note: HyperPay return URL is school.greenolasa.com (localhost return incomplete)."
  );
  console.log("");
});
