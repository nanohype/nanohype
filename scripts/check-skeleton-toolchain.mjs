#!/usr/bin/env node
/**
 * Every scaffoldable skeleton must ship the org's toolchain, and it must be the
 * same one — not a plausible-looking variant that drifted.
 *
 * The catalog is the factory's vocabulary: whatever a template scaffolds is
 * where a consumer's project starts. When the templates shipped eslint and
 * prettier while every repository in the org ran Biome, the swap happened by
 * hand after every scaffold and nothing checked that it finished. It did not —
 * one scaffolded package kept a `prettier --check .` script long after prettier
 * had stopped being a dependency of anything, so it resolved from a global
 * install on one machine and was `command not found` on a clean checkout.
 *
 * That failure is invisible to the rest of CI, because nothing reads a
 * skeleton's config: `biome.json` is data until someone scaffolds it. This
 * script is what reads it.
 *
 * Checked, for every `package.json` under `templates/&#42;/skeleton/`:
 *
 *   1. The skeleton root ships a `biome.json`.
 *   2. That config matches `library/config/biome.base.json` rule-for-rule.
 *      `$schema`, `files` and `css` may differ — the first is editor metadata,
 *      the other two are per-template facts (a Next.js app has `.next/`, a
 *      Tailwind app needs the directive-aware CSS parser). Everything that
 *      decides what passes review is compared, so loosening a rule in one
 *      skeleton is a failure rather than a local preference.
 *   3. No eslint or prettier config file survives anywhere under templates/.
 *   4. No manifest declares an eslint or prettier dependency.
 *   5. Every manifest declares @biomejs/biome, pinned to an exact version.
 *   6. `lint`, `format` and `format:check` invoke Biome.
 *   7. That version is the one `library/config/biome.base.json` declares in its
 *      `$schema`, and each skeleton's own `$schema` names it too.
 *
 * Rule 2 is the one that matters over time. Without it each skeleton's config
 * is free to drift from the base, and the catalog goes back to teaching 48
 * slightly different bars.
 *
 * Rule 7 is why `$schema` is a local key at all. Biome only validates the
 * `$schema` of the config it enters through, so a skeleton's is never checked by
 * anything until someone scaffolds it — and even then a mismatch is an `info`,
 * not a failure, so it never turns a build red. It stays wrong quietly, and an
 * editor validates the config against rules the installed Biome does not have.
 *
 * The pin has to be exact for that to mean anything: `^2.5.6` resolves to
 * whatever patch is newest at install time, so the `$schema` beside it starts
 * lying on the next release and every scaffolded project inherits the lie.
 * Exact is also what every repository in the org already does — Biome is the one
 * dependency pinned rather than ranged, because a formatter that floats makes
 * two contributors disagree about the same file.
 *
 *   node scripts/check-skeleton-toolchain.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(ROOT, "templates");
const BASE_PATH = join(ROOT, "library", "config", "biome.base.json");

/** Keys a skeleton may set beyond the shared base, and why. */
const LOCAL_KEYS = new Set([
  "$schema", // editor metadata — excluded here, checked by rule 7 instead
  "files", // build-output paths differ per template
  "css", // only the Tailwind-bearing skeletons need the directive parser
]);

/** The version in a `$schema` URL, or null when there isn't one. */
function schemaVersion(config) {
  const match = /biomejs\.dev\/schemas\/(\d+\.\d+\.\d+)\/schema\.json/.exec(config?.$schema ?? "");
  return match ? match[1] : null;
}

const BANNED = /eslint|prettier/i;
const CONFIG_NAMES =
  /^(eslint\.config\.[cm]?[jt]s|\.eslintrc.*|\.eslintignore|\.prettierrc.*|prettier\.config\.[cm]?[jt]s|\.prettierignore)$/;

const problems = [];
const fail = (where, message) => problems.push(`${where} — ${message}`);

/** Every file under `dir`, repo-relative, skipping installed dependencies. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    fail(relative(ROOT, path), `is not readable JSON (${err.message})`);
    return null;
  }
}

const base = readJson(BASE_PATH);
if (!base) {
  console.error("check-skeleton-toolchain: cannot read the shared Biome base");
  process.exit(1);
}

// The base's `$schema` is the catalog's Biome version: one place to bump, and
// rule 7 holds every skeleton to it. Without a parseable version here the rule
// would compare everything against null and pass, so this is a hard stop.
const BASE_VERSION = schemaVersion(base);
if (!BASE_VERSION) {
  console.error(
    "check-skeleton-toolchain: library/config/biome.base.json has no versioned $schema\n" +
      "  (expected https://biomejs.dev/schemas/<x.y.z>/schema.json) — it is the catalog's\n" +
      "  Biome version, and nothing else names it.",
  );
  process.exit(1);
}

let skeletons = 0;
let manifests = 0;

try {
  statSync(TEMPLATES);
} catch {
  console.error("check-skeleton-toolchain: no templates/ directory");
  process.exit(1);
}

const files = walk(TEMPLATES);

// 3. No banned config file survives.
for (const path of files) {
  if (CONFIG_NAMES.test(path.split("/").pop())) {
    fail(relative(ROOT, path), "is an eslint/prettier config — the catalog is Biome-only");
  }
}

for (const dir of readdirSync(TEMPLATES, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const skeleton = join(TEMPLATES, dir.name, "skeleton");
  let rootManifest;
  try {
    rootManifest = statSync(join(skeleton, "package.json")).isFile();
  } catch {
    continue; // not a JavaScript template — nothing to assert
  }
  if (!rootManifest) continue;
  skeletons++;

  // 1. The skeleton root ships a config.
  const configPath = join(skeleton, "biome.json");
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    fail(
      `${relative(ROOT, skeleton)}/biome.json`,
      "is missing — a scaffolded project would have no lint or format config",
    );
    continue;
  }

  // 2. It matches the shared base rule-for-rule.
  const local = JSON.stringify(
    Object.fromEntries(Object.entries(config).filter(([k]) => !LOCAL_KEYS.has(k))),
  );
  const shared = JSON.stringify(
    Object.fromEntries(Object.entries(base).filter(([k]) => !LOCAL_KEYS.has(k))),
  );
  if (local !== shared) {
    fail(
      `${relative(ROOT, configPath)}`,
      "does not match library/config/biome.base.json — re-copy it, keeping only `files`/`css` local",
    );
  }
  for (const key of Object.keys(config)) {
    if (!LOCAL_KEYS.has(key) && !(key in base)) {
      fail(relative(ROOT, configPath), `declares \`${key}\`, which the shared base does not`);
    }
  }

  // 7a. Its `$schema` names the catalog's Biome version.
  const version = schemaVersion(config);
  if (version === null) {
    fail(
      relative(ROOT, configPath),
      `has no versioned $schema — it should be https://biomejs.dev/schemas/${BASE_VERSION}/schema.json`,
    );
  } else if (version !== BASE_VERSION) {
    fail(
      relative(ROOT, configPath),
      `$schema names Biome ${version}, but the catalog is on ${BASE_VERSION} (library/config/biome.base.json)`,
    );
  }
}

// 4-6. Manifest rules, for nested packages as well as skeleton roots.
for (const path of files) {
  if (!path.endsWith("/package.json")) continue;
  if (!path.startsWith(`${TEMPLATES}/`)) continue;
  if (!path.includes("/skeleton/")) continue;
  const manifest = readJson(path);
  if (!manifest) continue;
  manifests++;
  const where = relative(ROOT, path);

  const deps = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const name of Object.keys(deps)) {
    if (BANNED.test(name)) fail(where, `declares \`${name}\` — the catalog is Biome-only`);
  }
  const pin = deps["@biomejs/biome"];
  if (!pin) {
    fail(where, "does not declare @biomejs/biome, so its lint and format scripts cannot run");
  } else if (pin !== BASE_VERSION) {
    // 7b. Exact, and the catalog's version. A range would resolve to a newer
    // patch than the `$schema` beside it names.
    fail(
      where,
      `pins @biomejs/biome to \`${pin}\`, but the catalog is on exactly ${BASE_VERSION} ` +
        "(library/config/biome.base.json's $schema) — an exact pin keeps that claim true",
    );
  }

  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    if (BANNED.test(command)) {
      fail(where, `script \`${name}\` runs \`${command}\` — the catalog is Biome-only`);
    }
  }
  for (const name of ["lint", "format", "format:check"]) {
    const command = manifest.scripts?.[name];
    if (command === undefined) {
      fail(where, `has no \`${name}\` script`);
    } else if (!/\bbiome\b/.test(command) && !/\bturbo\b/.test(command)) {
      fail(where, `script \`${name}\` is \`${command}\`, which invokes neither biome nor turbo`);
    }
  }
}

// Without this a broken walk would report the whole catalog compliant by
// finding nothing to inspect.
if (skeletons === 0 || manifests === 0) {
  console.error(
    `check-skeleton-toolchain: inspected ${skeletons} skeleton(s) and ${manifests} manifest(s) — the scan is broken`,
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error("check-skeleton-toolchain: the catalog's toolchain has drifted:\n");
  for (const line of problems) console.error(`  ✗ ${line}`);
  console.error(
    "\nEvery skeleton ships the org toolchain, and the same one. Fix the skeleton, or\n" +
      "change library/config/biome.base.json and re-copy it into every skeleton.\n",
  );
  process.exit(1);
}

console.log(
  `check-skeleton-toolchain: ${skeletons} skeleton(s) and ${manifests} manifest(s) all ship the shared Biome toolchain`,
);
