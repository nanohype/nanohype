#!/usr/bin/env node
/**
 * check-publishable-deps.mjs — reject local-path dependency protocols in any
 * package this repo publishes.
 *
 * npm does not rewrite `file:`, `link:`, `portal:` or `workspace:` specifiers at
 * publish time, and nothing in the publish pipeline does it either. A manifest
 * carrying one into the registry produces the worst available failure shape: a
 * consumer's `npm install` exits 0, silently omits the dependency, and the
 * package crashes with a module-not-found on first import. There is no install
 * error to read and no failed job to alert on.
 *
 * Nothing else catches this. The development tree resolves the path perfectly,
 * so lint, typecheck and the full test suite all pass on a manifest that is
 * already broken for everyone downstream — the bug only exists once the tarball
 * leaves the repo.
 *
 * A package is publishable when its manifest is not `private: true`, which is
 * npm's own definition, so this needs no list to keep in sync.
 *
 * Usage: node scripts/check-publishable-deps.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Only the sets npm installs on a consumer's behalf. A local path in
// devDependencies never reaches a consumer, so flagging it here would be noise
// that trains people to ignore the gate.
const CONSUMER_FACING = ["dependencies", "optionalDependencies", "peerDependencies"];

const LOCAL_PROTOCOL = /^(file:|link:|portal:|workspace:)/;

/** Top-level package manifests, excluding the repo root itself. */
function findManifests() {
  const found = [];
  for (const entry of readdirSync(repoRoot)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const dir = join(repoRoot, entry);
    if (!statSync(dir).isDirectory()) continue;
    const manifest = join(dir, "package.json");
    try {
      statSync(manifest);
    } catch {
      continue;
    }
    found.push(manifest);
  }
  return found.sort();
}

const violations = [];
let checked = 0;

for (const manifestPath of findManifests()) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.private === true) continue;
  checked++;

  for (const field of CONSUMER_FACING) {
    for (const [dep, spec] of Object.entries(manifest[field] ?? {})) {
      if (typeof spec === "string" && LOCAL_PROTOCOL.test(spec)) {
        violations.push({
          file: relative(repoRoot, manifestPath),
          pkg: manifest.name,
          field,
          dep,
          spec,
        });
      }
    }
  }
}

if (checked === 0) {
  console.error(
    "error: found no publishable packages to check — either the layout moved or every manifest is private, and both make this gate vacuous",
  );
  process.exit(1);
}

if (violations.length > 0) {
  console.error("Local-path dependencies in publishable packages:\n");
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(`    ${v.pkg} → ${v.field}.${v.dep} = "${v.spec}"`);
    console.error("    Publishing this installs cleanly and omits the dependency; the package");
    console.error("    then crashes on first import. Use a registry semver range.\n");
  }
  process.exit(1);
}

console.log(`ok: ${checked} publishable package(s), no local-path dependencies`);
