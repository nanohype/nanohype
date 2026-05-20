#!/usr/bin/env node
/**
 * Walks templates/* / template.yaml and composites/*.yaml, emits a stable
 * machine-readable catalog.json at the repo root.
 *
 * The catalog is committed so external clients can fetch it from a stable
 * GitHub raw URL without cloning. CI verifies the committed file is in sync
 * with the source manifests via `npm run verify:catalog`.
 *
 * Deterministic: entries sorted alphabetically by name. Re-running produces
 * byte-identical output unless a manifest changed.
 *
 * Run with: npm run generate:catalog
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEMPLATES_DIR = join(ROOT, "templates");
const COMPOSITES_DIR = join(ROOT, "composites");
const OUTPUT_PATH = join(ROOT, "catalog.json");

async function loadTemplates() {
  const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const manifestPath = join(TEMPLATES_DIR, e.name, "template.yaml");
    let raw;
    try {
      raw = await readFile(manifestPath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    }
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== "object") continue;
    out.push({
      name: parsed.name,
      displayName: parsed.displayName ?? parsed.name,
      description: oneLine(parsed.description ?? ""),
      version: String(parsed.version ?? "0.0.0"),
      category: parsed.category ?? "uncategorized",
      persona: normalizePersona(parsed.persona),
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      kind: parsed.kind === "brief" ? "brief" : "template",
      path: `templates/${e.name}`,
    });
  }
  out.sort(byName);
  return out;
}

async function loadComposites() {
  let entries;
  try {
    entries = await readdir(COMPOSITES_DIR);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const out = [];
  for (const file of entries) {
    if (!file.endsWith(".yaml")) continue;
    const manifestPath = join(COMPOSITES_DIR, file);
    const raw = await readFile(manifestPath, "utf8");
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== "object") continue;
    if (parsed.kind !== "composite") continue;
    out.push({
      name: parsed.name,
      displayName: parsed.displayName ?? parsed.name,
      description: oneLine(parsed.description ?? ""),
      version: String(parsed.version ?? "0.0.0"),
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      path: `composites/${file}`,
    });
  }
  out.sort(byName);
  return out;
}

function normalizePersona(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

function oneLine(s) {
  return String(s).replace(/\s+/g, " ").trim();
}

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

/**
 * Stable timestamp: use SOURCE_DATE_EPOCH (reproducible builds convention)
 * when set; fall back to the most recent mtime across source manifests.
 * The committed catalog stays byte-identical across re-runs that don't
 * touch the source manifests.
 */
async function stableTimestamp() {
  if (process.env.SOURCE_DATE_EPOCH) {
    const secs = parseInt(process.env.SOURCE_DATE_EPOCH, 10);
    if (Number.isFinite(secs)) return new Date(secs * 1000).toISOString();
  }
  const { stat } = await import("node:fs/promises");
  const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true });
  let latest = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const s = await stat(join(TEMPLATES_DIR, e.name, "template.yaml"));
      if (s.mtimeMs > latest) latest = s.mtimeMs;
    } catch {}
  }
  try {
    const files = await readdir(COMPOSITES_DIR);
    for (const f of files) {
      if (!f.endsWith(".yaml")) continue;
      const s = await stat(join(COMPOSITES_DIR, f));
      if (s.mtimeMs > latest) latest = s.mtimeMs;
    }
  } catch {}
  if (latest === 0) return new Date(0).toISOString();
  return new Date(Math.floor(latest / 1000) * 1000).toISOString();
}

async function main() {
  const templates = await loadTemplates();
  const composites = await loadComposites();
  const catalog = {
    $schema: "./schemas/catalog.schema.json",
    kind: "nanohype/catalog",
    version: "1",
    generated_at: await stableTimestamp(),
    templates,
    composites,
  };
  const json = JSON.stringify(catalog, null, 2) + "\n";
  await writeFile(OUTPUT_PATH, json, "utf8");
  console.log(`wrote ${OUTPUT_PATH} (${templates.length} templates, ${composites.length} composites)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
