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

Production school-orders API:
\`${PROD_ORDERS}\`

## Upload

1. Unzip \`greenola-school-app-client.zip\` (or upload the \`client-upload/\` folder contents).
2. Publish the **contents** to the school site root (Cloudflare Pages project for \`school.greenolasa.com\`), so that:
   - \`index.html\` is at the site root
   - \`assets/\`, \`_redirects\`, and \`_headers\` are alongside it
3. Do **not** nest an extra \`app/\` folder on the host unless your DNS already maps that path.
4. After deploy, smoke-check (no payment required):
   - \`https://school.greenolasa.com/bls\`
   - \`https://school.greenolasa.com/bls?order=SCH-…\` (uses \`GET ${PROD_ORDERS}/status\`)

## Routing (Cloudflare Pages)

\`_redirects\` (included):

\`\`\`
/:slug/  /:slug       301
/:slug   /?s=:slug    200
\`\`\`

Query strings (e.g. \`?order=\`) are preserved on the rewrite, so return URLs like \`/bls?order=SCH-…\` open the status screen and call the production status API.

## Backend contract (unchanged)

- \`POST /checkout\` — body from \`buildPayload()\`; **no** client totals; **no** \`x-api-key\`
- Success: \`response.data.paymentUrl\`, \`checkoutId\`, \`order_no\`, \`order_id\`, \`total\`, \`vat\`, \`currency\`, \`supportedBrands\`
- \`GET /status?order=&lang=\`
- Production widget host: \`eu-prod.oppwa.com\`; currency: **SAR**
- CORS / return host: \`https://school.greenolasa.com\`

## Not included (dev-only)

- \`dev-server.mjs\`, local mocks, payment-adapter mocks, \`docs/\`, localhost proxy

## Payment methods

- **Card / mada:** integrated via returned \`supportedBrands\` (typically \`VISA MASTER MADA\`).
- **Apple Pay:** UI option remains; **not verified live**. Frontend does not inject \`APPLEPAY\` unless the backend returns it in \`supportedBrands\`. Confirm with backend before claiming Apple Pay support.

## Important

This package was **not** used for a live end-to-end production charge in packaging. Perform the first real payment manually after upload and share \`order_no\` with the backend developer.
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
  if (!/openStatus\(no\)/.test(packedHtml) || !/QS\.get\('order'\)/.test(packedHtml)) {
    throw new Error("Packed boot order-status wiring missing");
  }

  console.log("OK", OUT);
  console.log("OK", ZIP);
  console.log("Files:", files.length);
  files.forEach((f) => console.log(" -", f));
}

main();
