#!/usr/bin/env node
/**
 * Deploy app/vercel-preview as a static Vercel project via REST API.
 * Uses the local CLI auth.json token (already validated).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, "..");
const ROOT = path.join(APP, "vercel-preview");
const TEAM = "team_yNvyhetiIpDRHbF0N5amFTFj";
const PROJECT_NAME = "greenola-school-app";

const authPath = path.join(
  process.env.HOME,
  "Library/Application Support/com.vercel.cli/auth.json"
);
const token = JSON.parse(fs.readFileSync(authPath, "utf8")).token;
if (!token) {
  console.error("No Vercel token in auth.json — run: npx vercel login --oob");
  process.exit(1);
}

const SKIP = new Set([".vercel", "node_modules", ".git", "PREVIEW.md"]);

function walk(dir, base = dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".") && ent.name !== ".gitignore") {
      if (SKIP.has(ent.name)) continue;
    }
    if (SKIP.has(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, base, out);
    else out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out;
}

async function api(method, urlPath, body, isJson = true) {
  const url = new URL(urlPath, "https://api.vercel.com");
  if (!url.searchParams.has("teamId")) url.searchParams.set("teamId", TEAM);
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (body != null) {
    if (isJson) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    } else {
      payload = body;
    }
  }
  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Vercel API ${method} ${url.pathname} → ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function ensureProject() {
  const list = await api(
    "GET",
    `/v9/projects?limit=100&search=${encodeURIComponent(PROJECT_NAME)}`
  );
  const found = (list.projects || []).find((p) => p.name === PROJECT_NAME);
  if (found) {
    console.log("project", found.id, found.name);
    return found;
  }
  const created = await api("POST", "/v10/projects", {
    name: PROJECT_NAME,
    framework: null,
  });
  console.log("created project", created.id, created.name);
  return created;
}

async function uploadFile(rel) {
  const abs = path.join(ROOT, rel);
  const buf = fs.readFileSync(abs);
  const sha = createHash("sha1").update(buf).digest("hex");
  const res = await fetch(
    `https://api.vercel.com/v2/files?teamId=${TEAM}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "x-vercel-digest": sha,
        "Content-Length": String(buf.length),
      },
      body: buf,
    }
  );
  if (res.status === 200 || res.status === 409) {
    return { file: rel, sha, size: buf.length };
  }
  const text = await res.text();
  throw new Error(`upload ${rel} → ${res.status} ${text}`);
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, "index.html"))) {
    throw new Error("Missing vercel-preview/index.html — sync from client-upload first");
  }
  const project = await ensureProject();
  const files = walk(ROOT);
  console.log("uploading", files.length, "files");
  const uploaded = [];
  for (const rel of files) {
    const meta = await uploadFile(rel);
    uploaded.push(meta);
    console.log(" +", rel);
  }
  const deployment = await api("POST", "/v13/deployments", {
    name: PROJECT_NAME,
    project: project.id,
    projectSettings: {
      framework: null,
    },
    target: "production",
    files: uploaded.map((f) => ({
      file: f.file,
      sha: f.sha,
      size: f.size,
    })),
  });
  console.log("deployment", deployment.id, deployment.url);
  console.log("READY", JSON.stringify({
    deploymentId: deployment.id,
    url: deployment.url ? `https://${deployment.url}` : null,
    inspector: deployment.inspectorUrl || null,
    projectId: project.id,
    projectName: project.name,
    aliases: deployment.alias || deployment.aliases || null,
  }, null, 2));
}

main().catch((e) => {
  console.error("FAIL", e.message);
  if (e.body) console.error(JSON.stringify(e.body, null, 2));
  process.exit(1);
});
