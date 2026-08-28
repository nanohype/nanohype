#!/usr/bin/env node
/**
 * A composite names things, and every name it uses has to resolve.
 *
 * `schemas/composite.schema.json` constrains one manifest read on its own:
 * required keys, the `kind` discriminator, `name` and `version` patterns,
 * `path` xor `root`. That is the whole reach of a JSON Schema — it has no
 * vocabulary for the other file in the directory, for the filename the manifest
 * sits in, or for whether an identifier written in one field is declared in
 * another. Everything a consumer actually resolves lives on that side of the
 * line, so shape validation passing says nothing about it.
 *
 * The failures below are all silent in the same way the pre-schema `kind` typo
 * was: the composite still validates, still appears in the catalog, still
 * renders without throwing, and the result is missing something.
 *
 *   1. `name` matches the filename stem.
 *
 *      Every consumer lists composites by reading the manifest but fetches one
 *      by path: `LocalSource.fetchComposite(name)` and `GitHubSource` both open
 *      `composites/<name>.yaml`. A manifest whose `name` disagrees with its
 *      filename is therefore listed under an identifier that cannot be fetched.
 *      The render gate does catch this, but only as a read failure some steps
 *      away from the field that is wrong.
 *
 *   2. No two composites declare the same `name`.
 *
 *      Two files, one identifier: the catalog carries both rows, and
 *      `fetchComposite` resolves by filename, so one row's content is
 *      unreachable — a catalog entry no consumer can retrieve. Nothing else
 *      compares manifests to each other.
 *
 *   3. Every `condition` names a declared variable.
 *
 *      `renderComposite` includes an entry when
 *      `resolved[entry.condition] === "true"`. An undeclared name resolves to
 *      `undefined`, which is not `"true"`, so the member is dropped — by the
 *      same path, and with the same absence of any warning, as a condition that
 *      was deliberately false. A typo removes a template from every project
 *      scaffolded from that composite.
 *
 *   4. Every `${Name}` in an entry's variables names a declared variable.
 *
 *      Entry-level expansion is `resolved[ref] ?? ""`, so an unresolvable
 *      reference becomes the empty string and reaches the member template as a
 *      falsy value. A mistyped variable name is indistinguishable from asking
 *      for that feature to be off, and the conditional files it gated leave the
 *      output.
 *
 * Composite-level `variables[].default` is deliberately not checked here:
 * `resolveVariables` already throws `references unknown variable` on it, so that
 * site fails loudly and a second check would only duplicate the first.
 * Composite-to-template references are likewise left to `validate-catalog.sh`,
 * which already resolves them against `templates/`.
 *
 *   node scripts/check-composite-references.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as yaml from "js-yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSITES = join(ROOT, "composites");

/** The extension every consumer filters on, so the only one that is a manifest. */
const MANIFEST_SUFFIX = ".yaml";

/** Entry-level and default-level references share this form. */
const REFERENCE = /\$\{(\w+)\}/g;

const problems = [];
const fail = (where, message) => problems.push(`${where} — ${message}`);

let files;
try {
  files = readdirSync(COMPOSITES)
    .filter((f) => f.endsWith(MANIFEST_SUFFIX))
    .sort();
} catch {
  console.error("check-composite-references: no composites/ directory");
  process.exit(1);
}

// A gate that reads nothing reports success over nothing. The corpus is the
// thing being asserted, so an empty one is a failure rather than a vacuous pass.
if (files.length === 0) {
  console.error(
    `check-composite-references: composites/ holds no ${MANIFEST_SUFFIX} manifest —\n` +
      "  the enumeration matched nothing, so this check is asserting nothing.",
  );
  process.exit(1);
}

/** Every manifest that parses, keyed by the file it came from. */
const manifests = new Map();

for (const file of files) {
  const rel = `composites/${file}`;
  let manifest;
  try {
    manifest = yaml.load(readFileSync(join(COMPOSITES, file), "utf8"));
  } catch (err) {
    fail(rel, `is not readable YAML (${err.message})`);
    continue;
  }
  if (!manifest || typeof manifest !== "object") {
    fail(rel, "does not parse to a mapping");
    continue;
  }
  manifests.set(rel, manifest);
}

// 1. `name` matches the filename stem.
for (const [rel, manifest] of manifests) {
  const stem = basename(rel, MANIFEST_SUFFIX);
  if (manifest.name !== stem) {
    fail(
      rel,
      `declares name '${manifest.name}', but every consumer fetches it as ` +
        `composites/${manifest.name}${MANIFEST_SUFFIX} — rename the file or the field so they agree`,
    );
  }
}

// 2. No two composites declare the same `name`.
const byName = new Map();
for (const [rel, manifest] of manifests) {
  if (typeof manifest.name !== "string") continue;
  const seen = byName.get(manifest.name);
  if (seen) {
    fail(
      rel,
      `declares name '${manifest.name}', which ${seen} already declares — ` +
        "the catalog would carry both rows and fetch resolves to one file, so one is unreachable",
    );
  } else {
    byName.set(manifest.name, rel);
  }
}

// 3 and 4. Every identifier an entry names is declared by its own manifest.
for (const [rel, manifest] of manifests) {
  const declared = new Set(
    (Array.isArray(manifest.variables) ? manifest.variables : [])
      .map((v) => v?.name)
      .filter((n) => typeof n === "string"),
  );
  const entries = Array.isArray(manifest.templates) ? manifest.templates : [];

  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== "object") continue;
    // `templates[i]` rather than the template name: the name is what may be
    // missing, and an error that cannot point at the entry is hard to act on.
    const at = `${rel} templates[${index}]`;

    if (typeof entry.condition === "string" && !declared.has(entry.condition)) {
      fail(
        at,
        `condition names '${entry.condition}', which this composite does not declare — ` +
          "an undeclared condition is never true, so this member would be dropped silently",
      );
    }

    for (const [key, value] of Object.entries(entry.variables ?? {})) {
      if (typeof value !== "string") continue;
      for (const [, ref] of value.matchAll(REFERENCE)) {
        if (!declared.has(ref)) {
          fail(
            at,
            `${key} references \${${ref}}, which this composite does not declare — ` +
              "an unresolvable reference expands to the empty string rather than failing",
          );
        }
      }
    }
  }
}

if (problems.length > 0) {
  console.error("Composite references that do not resolve:\n");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    "\nA composite may only name variables it declares, must be named as its file is,\n" +
      "and must not share a name with another composite.",
  );
  process.exit(1);
}

console.log(`${manifests.size} composite manifest(s): every name and reference resolves.`);
