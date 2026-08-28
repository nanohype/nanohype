#!/usr/bin/env node
/**
 * Everything under `composites/` must be a file some consumer will open.
 *
 * A composite is discovered, not registered. `generate-catalog.mjs`, the SDK's
 * `LocalSource` and its `GitHubSource` each read the directory, keep the entries
 * whose name ends in `.yaml`, and ignore the rest — no recursion, no other
 * extension, no error. `validate-schema.mjs` expands the same shape from the
 * other side, so the corpus the gates read and the corpus the consumers read are
 * the same set by construction.
 *
 * That agreement is the reason a file outside the set is invisible twice over. A
 * `.yml` manifest, or a `.yaml` one a directory deeper, is a complete and valid
 * composite that no consumer lists, no schema validates and no gate mentions:
 * writing one produces no catalog entry and no diagnostic, and the only symptom
 * is a composite the author believes they added and nobody can scaffold.
 *
 * So the enumeration is asserted to be total. Every entry directly under
 * `composites/` is a `.yaml` file, and anything else is named here rather than
 * skipped. Prose about composites belongs under `docs/`, which is why this can
 * be an exact rule instead of an allowlist that grows.
 *
 *   node scripts/check-composite-files.mjs
 */
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSITES = join(ROOT, "composites");

/** The extension every consumer filters on, so the only one that is a manifest. */
const MANIFEST_SUFFIX = ".yaml";

let entries;
try {
  entries = readdirSync(COMPOSITES, { withFileTypes: true });
} catch {
  console.error("check-composite-files: no composites/ directory");
  process.exit(1);
}

const problems = [];
let manifests = 0;

for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
  const rel = `composites/${entry.name}`;

  if (entry.isDirectory()) {
    problems.push(
      `${rel}/ — is a directory, and every consumer reads composites/ one level deep, ` +
        "so a manifest inside it is listed by nothing; move it up or out",
    );
    continue;
  }

  if (!entry.isFile()) {
    problems.push(`${rel} — is neither a file nor a directory, and nothing reads it`);
    continue;
  }

  if (!entry.name.endsWith(MANIFEST_SUFFIX)) {
    problems.push(
      `${rel} — does not end in ${MANIFEST_SUFFIX}, which is the extension every consumer ` +
        "filters on, so it is validated by nothing and listed by nothing",
    );
    continue;
  }

  manifests++;
}

// A gate that reads nothing reports success over nothing. The corpus is what is
// being asserted, so an empty one is a failure rather than a vacuous pass.
if (manifests === 0) {
  problems.push(
    `composites/ — holds no ${MANIFEST_SUFFIX} manifest, so this check is asserting nothing`,
  );
}

if (problems.length > 0) {
  console.error("Files under composites/ that no consumer reads:\n");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    `\ncomposites/ holds ${MANIFEST_SUFFIX} manifests and nothing else. Documentation goes ` +
      "under docs/.",
  );
  process.exit(1);
}

console.log(`composites/ holds ${manifests} ${MANIFEST_SUFFIX} manifest(s) and nothing else.`);
