#!/usr/bin/env node
/**
 * Refresh app/vercel-preview from latest client-upload + Vercel-only infra.
 * Preview patches:
 * - menu → same-origin /api/school-menu
 * - school-orders → same-origin /api/school-orders (checkout + status)
 * Static school ZIP must never include this proxy (pack-client excludes vercel-*).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(app, "client-upload");
const dest = path.join(app, "vercel-preview");
const infraApi = path.join(app, "vercel-infra", "api");

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

if (!fs.existsSync(path.join(src, "index.html"))) {
  console.error("Run node scripts/pack-client.mjs first");
  process.exit(1);
}
const required = [
  path.join(infraApi, "school-menu.js"),
  path.join(infraApi, "school-orders", "checkout.js"),
  path.join(infraApi, "school-orders", "status.js"),
];
for (const f of required) {
  if (!fs.existsSync(f)) {
    console.error("Missing", f);
    process.exit(1);
  }
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
execFileSync("rsync", [
  "-a",
  "--exclude",
  "FILES.txt",
  "--exclude",
  "UPLOAD.md",
  src + "/",
  dest + "/",
]);
fs.copyFileSync(path.join(app, "vercel.json"), path.join(dest, "vercel.json"));

copyFile(
  path.join(infraApi, "school-menu.js"),
  path.join(dest, "api", "school-menu.js")
);
copyFile(
  path.join(infraApi, "school-orders", "checkout.js"),
  path.join(dest, "api", "school-orders", "checkout.js")
);
copyFile(
  path.join(infraApi, "school-orders", "status.js"),
  path.join(dest, "api", "school-orders", "status.js")
);

const indexPath = path.join(dest, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
html = html.replace(
  /const API_REMOTE='https:\/\/jmtqldgovmmhaystvpdu\.supabase\.co\/functions\/v1';/,
  "const API_REMOTE='/api'; /* Vercel preview: same-origin read-only school-menu proxy */"
);
if (!html.includes("const API_REMOTE='/api'")) {
  console.error("Failed to patch API_REMOTE for Vercel preview menu proxy");
  process.exit(1);
}
html = html.replace(
  /<!-- Client package: production school-orders API only\. -->/,
  "<!-- Vercel preview: menu + school-orders via same-origin /api proxies; HyperPay return still backend-owned. -->"
);
/* Force school-orders base before the API script loads */
if (!html.includes("SCHOOL_ORDERS_API_BASE")) {
  html = html.replace(
    /<script src="assets\/school-orders-api\.js"><\/script>/,
    '<script>window.SCHOOL_ORDERS_API_BASE="/api/school-orders";</script>\n<script src="assets/school-orders-api.js"></script>'
  );
}
if (!html.includes('SCHOOL_ORDERS_API_BASE="/api/school-orders"')) {
  console.error("Failed to inject SCHOOL_ORDERS_API_BASE for preview proxy");
  process.exit(1);
}
fs.writeFileSync(indexPath, html, "utf8");

/* Also hardcode DEFAULT_BASE in the preview copy (belt and suspenders) */
const apiJsPath = path.join(dest, "assets", "school-orders-api.js");
let apiJs = fs.readFileSync(apiJsPath, "utf8");
apiJs = apiJs.replace(
  /var DEFAULT_BASE =\s*"https:\/\/backend\.greenolasa\.com\/api\/v1\/school-orders";/,
  'var DEFAULT_BASE = "/api/school-orders"; /* Vercel preview proxy */'
);
if (!apiJs.includes('DEFAULT_BASE = "/api/school-orders"')) {
  console.error("Failed to patch school-orders-api.js DEFAULT_BASE");
  process.exit(1);
}
fs.writeFileSync(apiJsPath, apiJs, "utf8");

if (fs.existsSync(path.join(app, "docs", "VERCEL_PREVIEW.md"))) {
  fs.copyFileSync(
    path.join(app, "docs", "VERCEL_PREVIEW.md"),
    path.join(dest, "PREVIEW.md")
  );
}

console.log("OK", dest);
console.log("Menu → /api/school-menu ; Orders → /api/school-orders/{checkout,status}");
