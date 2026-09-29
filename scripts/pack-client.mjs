#!/usr/bin/env node
/**
 * Build a clean client upload package (no local mocks / proxy / DEV tooling).
 * Source: app/ working tree. Output: app/client-upload/ + app/greenola-school-app-client.zip
 *
 * Usage: node scripts/pack-client.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, "..");
const OUT = path.join(APP, "client-upload");
const ZIP = path.join(APP, "greenola-school-app-client.zip");
const PROD_ORDERS = "https://backend.greenolasa.com/api/v1/school-orders";

const SKIP_NAMES = new Set([
  "local-mock-menu.js",
  "school-payment-adapter.js",
  "dev-server.mjs",
  "package.json",
  "package-lock.json",
  ".DS_Store",
]);

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "client-upload",
  "docs",
  "scripts",
]);

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function copyFiltered(srcDir, destDir) {
  ensureDir(destDir);
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    if (SKIP_NAMES.has(ent.name)) continue;
    if (ent.isDirectory() && SKIP_DIRS.has(ent.name)) continue;
    const from = path.join(srcDir, ent.name);
    const to = path.join(destDir, ent.name);
    if (ent.isDirectory()) copyFiltered(from, to);
    else if (ent.isFile()) fs.copyFileSync(from, to);
  }
}

function cleanIndexHtml(html) {
  let out = html;
  out = out.replace(
    /\s*<script src="assets\/school-payment-adapter\.js"><\/script>\s*/g,
    "\n"
  );
  out = out.replace(
    /\s*<script src="assets\/local-mock-menu\.js"><\/script>\s*/g,
    "\n"
  );
  out = out.replace(
    /\s*<div id="localPreviewBanner" class="local-preview-banner"[^>]*><\/div>\s*/g,
    "\n"
  );
  out = out.replace(
    /\/\* Mock \/ file:\/\/ stay read-only\. Localhost may call production school-orders via \/__school-orders proxy\. \*\//g,
    "/* Client package: school-orders → production API only. */"
  );
  /* Delivery build: disable ?localMock= and localhost menu proxy; hosted site must use live APIs. */
  out = out.replace(
    /const FORCE_LOCAL_MOCK=QS\.get\('localMock'\)==='1'\|\|QS\.get\('localMock'\)==='true';/,
    "const FORCE_LOCAL_MOCK=false; /* client package: mocks disabled */"
  );
  out = out.replace(
    /const USE_LOCAL_PROXY=\(\(\)=>\{[\s\S]*?\}\)\(\);/,
    "const USE_LOCAL_PROXY=false; /* client package: no localhost proxy */"
  );
  out = out.replace(
    /\/\* Local preview \(dev-server\.mjs\):[^\n]*\nconst API_LOCAL_PROXY='\/__dev-api';\n/,
    "/* Client package: menu API is HTTPS remote only (no local proxy). */\nconst API_LOCAL_PROXY='';\n"
  );
  out = out.replace(
    /\/\* Local file:\/\/ or localhost: use proxy or labeled mock \(see LOCAL_DATA_MODE\)\. \*\//,
    "/* Hosted package: live HTTPS APIs only. file:// cannot load menu/orders (browser CORS). */"
  );
  out = out.replace(
    /\/\* Production Pages \+ local dev-server both support clean \/\{\s*slug\s*\} rewrites\. \*\//,
    "/* Hosted clean URLs use /{slug} via server rewrite (see UPLOAD.md). */"
  );
  out = out.replace(
    /<!-- ============ 8\. HYPERPAY WIDGET ============ -->/,
    "<!-- Client package: production school-orders API only. -->\n  <!-- ============ 8. HYPERPAY WIDGET ============ -->"
  );
  if (out.includes("backend-dev.greenolasa.com")) {
    throw new Error("index.html still references backend-dev");
  }
  if (out.includes("school-payment-adapter.js") || out.includes("local-mock-menu.js")) {
    throw new Error("index.html still references removed scripts");
  }
  if (/FORCE_LOCAL_MOCK=QS\.get/.test(out) || /USE_LOCAL_PROXY=\(\(\)=>/.test(out)) {
    throw new Error("Failed to disable local mock/proxy switches in packaged index");
  }
  if (/npm run/i.test(out) || /127\.0\.0\.1:5173/.test(out)) {
    throw new Error("Packaged index still contains development preview instructions");
  }
  return out;
}

function productionOrdersApi(src) {
  /* Delivery build: always hit production; never /__school-orders. */
  const start = src.indexOf("function resolveBase()");
  const end = src.indexOf("function pickMsg(");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Could not locate resolveBase() in school-orders-api.js");
  }
  let out =
    src.slice(0, start) +
    `function resolveBase() {
    if (global.SCHOOL_ORDERS_API_BASE)
      return String(global.SCHOOL_ORDERS_API_BASE).replace(/\\/$/, "");
    return DEFAULT_BASE;
  }

  ` +
    src.slice(end);

  out = out.replace(
    /Localhost: resolveBase\(\) uses \/__school-orders[^\n]*\n \* Override: window\.SCHOOL_ORDERS_API_BASE/,
    "Client upload package: always uses production base (no localhost proxy).\n * Override: window.SCHOOL_ORDERS_API_BASE"
  );

  if (!out.includes(PROD_ORDERS)) {
    throw new Error("school-orders-api.js missing production base");
  }
  if (out.includes("backend-dev.greenolasa.com")) {
    throw new Error("school-orders-api.js still references backend-dev");
  }
  if (out.includes("/__school-orders")) {
    throw new Error("packaged school-orders-api.js still has localhost proxy path");
  }
  return (
    "/** CLIENT PACKAGE — production only. Do not use for local proxy development. */\n" +
    out
  );
}

function writeUploadGuide(dest) {
  const body = `# Greenola school parent app — client upload

**Static site only.** Upload these files to the web host. No Node.js, npm, \`package.json\`, or development proxy is required on the client server.

Production school-orders API (browser calls this directly over HTTPS):
\`${PROD_ORDERS}\`

## What to upload

Unzip \`greenola-school-app-client.zip\` and publish **all of the following** to the **site root** for \`school.greenolasa.com\` (same folder level — do not nest under \`app/\`):

| Path | Required |
|------|----------|
| \`index.html\` | **Yes** |
| \`assets/**\` (css, js, fonts, logos, dishes, photos) | **Yes** |
| \`_redirects\` | If host is Cloudflare Pages (or another host that reads this file) |
| \`_headers\` | Optional (security headers; Cloudflare Pages) |
| \`UPLOAD.md\` / \`FILES.txt\` | Optional (docs only; safe to omit from public root) |

There is **no** \`package.json\`, \`node_modules\`, or \`npm run\` step for production.

## Routing (required)

Parents open \`https://school.greenolasa.com/bls\` (or \`/bls?order=SCH-…\`).

Configure a rewrite so a single path segment maps to the app **and preserves the query string**:

| From | To |
|------|----|
| \`/{slug}/\` | \`/{slug}\` (optional trailing-slash fix) |
| \`/{slug}\` | \`/?s={slug}\` or \`/index.html?s={slug}\` (**keep** \`?order=\`, etc.) |

Cloudflare Pages form (included as \`_redirects\`):

\`\`\`
/:slug/  /:slug       301
/:slug   /?s=:slug    200
\`\`\`

If your host ignores \`_redirects\`, set the same rule in nginx / Apache / Netlify / S3+CloudFront / etc. Without a rewrite, use \`https://school.greenolasa.com/?s=bls\` instead of \`/bls\`.

## APIs the hosted app calls (no local proxy)

From \`https://school.greenolasa.com\` the browser calls:

1. **Menu** — \`https://jmtqldgovmmhaystvpdu.supabase.co/functions/v1/school-menu?…\`
2. **Checkout / status** — \`${PROD_ORDERS}/checkout\` and \`…/status?order=…\`
3. **HyperPay widget** — script URL returned in checkout \`paymentUrl\` (do not rewrite the host)
4. **CDN** — Lucide icons from \`cdn.jsdelivr.net\` (optional UI icons)

Backend CORS / HyperPay return host must allow \`https://school.greenolasa.com\`.

## Do not preview with \`file://\`

Opening \`index.html\` from disk (\`file://…\`) is **not** a valid test of the client package:

- Browsers block or restrict \`fetch\` to HTTPS APIs from a \`file://\` origin (CORS / opaque origin).
- Clean URLs like \`/bls\` do not exist on \`file://\`.
- A toast about not loading data from “this location” is **expected** — it is not a packaging defect.

After upload, smoke-check on the real host (no payment required):

- \`https://school.greenolasa.com/bls\` — menu loads
- \`https://school.greenolasa.com/bls?order=SCH-…\` — status uses production \`GET …/status\`

## Backend contract

- \`POST /checkout\` — body from \`buildPayload()\`; **no** client totals; **no** \`x-api-key\`
- Success: \`response.data.paymentUrl\`, \`checkoutId\`, \`order_no\`, \`order_id\`, \`total\`, \`vat\`, \`currency\`, \`supportedBrands\`
- \`GET /status?order=&lang=\` — UI never treats the URL alone as paid
- Widget: use backend-returned \`paymentUrl\` as-is (production expects \`eu-prod.oppwa.com\` + **SAR**)

## Payment methods (honest status)

- **Visa / Mastercard / mada:** brands from \`supportedBrands\`; widget UI approved. **Live production charge: not verified in this package.**
- **Apple Pay:** UI option only; \`APPLEPAY\` is not injected unless the backend returns it. **Not verified live.**

## Important

This package was **not** used for a live end-to-end production charge. After upload, run one real payment and share \`order_no\` with the backend developer.
`;
  fs.writeFileSync(path.join(dest, "UPLOAD.md"), body, "utf8");
}

function listFiles(dir, base = dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) listFiles(p, base, acc);
    else acc.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return acc.sort();
}

function main() {
  console.log("Packing client upload from", APP);
  rmrf(OUT);
  ensureDir(OUT);

  /* Copy root publish files */
  for (const f of ["index.html", "_redirects", "_headers"]) {
    fs.copyFileSync(path.join(APP, f), path.join(OUT, f));
  }
  copyFiltered(path.join(APP, "assets"), path.join(OUT, "assets"));

  /* Transform index + API for production-only delivery */
  const indexPath = path.join(OUT, "index.html");
  fs.writeFileSync(indexPath, cleanIndexHtml(fs.readFileSync(indexPath, "utf8")), "utf8");

  const apiPath = path.join(OUT, "assets", "school-orders-api.js");
  fs.writeFileSync(
    apiPath,
    productionOrdersApi(fs.readFileSync(apiPath, "utf8")),
    "utf8"
  );

  if (fs.existsSync(path.join(OUT, "assets", "local-mock-menu.js"))) {
    throw new Error("local-mock-menu.js leaked into package");
  }
  if (fs.existsSync(path.join(OUT, "assets", "school-payment-adapter.js"))) {
    throw new Error("school-payment-adapter.js leaked into package");
  }
  if (fs.existsSync(path.join(OUT, "dev-server.mjs"))) {
    throw new Error("dev-server.mjs leaked into package");
  }

  writeUploadGuide(OUT);

  const files = listFiles(OUT);
  fs.writeFileSync(
    path.join(OUT, "FILES.txt"),
    files.concat(["FILES.txt"]).sort().join("\n") + "\n",
    "utf8"
  );

  /* ZIP from inside client-upload so archive root is the site files */
  rmrf(ZIP);
  execFileSync("zip", ["-r", "-q", ZIP, "."], { cwd: OUT });

  /* Verify zip contents + production endpoint */
  const zipList = execFileSync("unzip", ["-l", ZIP], { encoding: "utf8" });
  if (!zipList.includes("index.html") || !zipList.includes("school-orders-api.js")) {
    throw new Error("ZIP missing required entries");
  }
  const packedApi = fs.readFileSync(apiPath, "utf8");
  if (!packedApi.includes(PROD_ORDERS) || packedApi.includes("/__school-orders")) {
    throw new Error("Packed API verification failed");
  }
  const packedHtml = fs.readFileSync(indexPath, "utf8");
  if (!packedHtml.includes("assets/school-orders-api.js")) {
    throw new Error("Packed index missing school-orders-api.js");
  }
  if (packedHtml.includes("school-order-status")) {
    throw new Error("Packed index still references Supabase school-order-status");
  }
  if (!packedHtml.includes("const FORCE_LOCAL_MOCK=false")) {
    throw new Error("Packed index did not disable FORCE_LOCAL_MOCK");
  }
  if (!packedHtml.includes("const USE_LOCAL_PROXY=false")) {
    throw new Error("Packed index did not disable USE_LOCAL_PROXY");
  }
  if (
    packedHtml.includes("backend-dev.greenolasa.com") ||
    packedHtml.includes("/__school-orders")
  ) {
    throw new Error("Packed index still references DEV/proxy school-orders paths");
  }
  if (!/openStatus\(no\)/.test(packedHtml) || !/QS\.get\('order'\)/.test(packedHtml)) {
    throw new Error("Packed boot order-status wiring missing");
  }
  if (!packedApi.includes('"https://backend.greenolasa.com/api/v1/school-orders"')) {
    throw new Error("Packed API missing exact production DEFAULT_BASE");
  }

  console.log("OK", OUT);
  console.log("OK", ZIP);
  console.log("Files:", files.length);
  files.forEach((f) => console.log(" -", f));
}

main();
