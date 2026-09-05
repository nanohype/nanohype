#!/usr/bin/env node

/**
 * Every file a built extension's manifest names must be a file the build
 * produced.
 *
 * A manifest is JSON and carries no conditional, so one that is checked in
 * names every entry in every build, including the ones a conditional dropped.
 * Chrome does not refuse to install such an extension: it accepts it, and the
 * options page opens blank or the content script never runs, with nothing to
 * say why. The same holds for a path the bundler renamed — a stylesheet the
 * manifest calls one thing and the build emits as another is missing at run
 * time and present in the source tree.
 *
 * This runs the build. Which files a bundler emits is decided by the bundler:
 * its conditional entries, its output naming, its hashing, and the assets an
 * entry pulls in. Reading the config would answer what its author intended,
 * and the two differ exactly where this class of defect lives.
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(ROOT, "templates");

/**
 * Templates whose skeleton builds a browser-extension manifest.
 *
 * `manifest_version` is the key the extension platform requires, so a skeleton
 * that produces a manifest names it somewhere — in a checked-in manifest, or
 * in the code that emits one. It is fixed by the platform rather than chosen
 * by whoever wrote the skeleton, which is what makes it usable as the marker.
 */
export function extensionSkeletons() {
  const found = [];
  for (const template of readdirSync(TEMPLATES).sort()) {
    const skeleton = join(TEMPLATES, template, "skeleton");
    const pkgPath = join(skeleton, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (!pkg.scripts?.build) continue;

    const declares = filesUnder(skeleton, skeleton).some((file) => {
      if (file.startsWith("node_modules/") || file.startsWith("dist/")) return false;
      if (!/\.(ts|tsx|js|mjs|json)$/.test(file)) return false;
      return readFileSync(join(skeleton, file), "utf-8").includes("manifest_version");
    });
    if (declares) found.push(template);
  }
  return found;
}

/** Every string in a manifest that names a file the build has to have made. */
export function referencedPaths(manifest) {
  const paths = new Set();
  const looksLikeAPath = (value) =>
    typeof value === "string" && /\.[a-z0-9]{2,5}$/i.test(value) && !value.includes("*");

  // Keys whose values are match patterns or ids rather than files.
  const NOT_PATHS = new Set(["matches", "exclude_matches", "permissions", "host_permissions"]);

  const walk = (node, key) => {
    if (NOT_PATHS.has(key)) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, key);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, k);
      return;
    }
    if (looksLikeAPath(node)) paths.add(node);
  };
  walk(manifest, "");
  return [...paths].sort();
}

/** Every file under a directory, as directory-relative POSIX paths. */
function filesUnder(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(full, base, acc);
    else acc.push(relative(base, full).split("\\").join("/"));
  }
  return acc;
}

/** Every combination of a manifest's bool variables. */
function boolCombinations(manifest) {
  const bools = (manifest.variables ?? []).filter((v) => v.type === "bool").map((v) => v.name);
  let combinations = [{}];
  for (const name of bools) {
    combinations = combinations.flatMap((base) => [
      { ...base, [name]: true },
      { ...base, [name]: false },
    ]);
  }
  return combinations;
}

function otherValues(manifest) {
  const values = {};
  for (const variable of manifest.variables ?? []) {
    if (variable.type === "bool") continue;
    values[variable.name] = variable.default ?? defaultFor(variable);
  }
  return values;
}

function defaultFor(variable) {
  if (variable.type === "number") return 1;
  const pattern = variable.validation?.pattern;
  return pattern && !new RegExp(pattern).test("a-name") ? "aname" : "a-name";
}

function describe(flags) {
  const entries = Object.entries(flags);
  return entries.length === 0 ? "the only build" : entries.map(([k, v]) => `${k}=${v}`).join(" ");
}

/** Build every render of one template and report what its manifest names. */
export async function manifestsPerBuild(template, workDir) {
  const { LocalSource, renderTemplate } = await import("../sdk/dist/index.js");
  const source = new LocalSource({ rootDir: ROOT });
  const { manifest, files } = await source.fetchTemplate(template);

  const skeleton = join(TEMPLATES, template, "skeleton");
  const modules = join(skeleton, "node_modules");
  if (!existsSync(modules)) {
    throw new Error(
      `templates/${template}/skeleton has no node_modules, so its build cannot run. ` +
        "Install the skeleton's dependencies before this gate.",
    );
  }

  const builds = [];
  for (const flags of boolCombinations(manifest)) {
    const rendered = renderTemplate(manifest, files, { ...otherValues(manifest), ...flags });
    const dir = join(workDir, Object.values(flags).join("-") || "only");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    for (const file of rendered.files) {
      const target = join(dir, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content);
    }
    cpSync(modules, join(dir, "node_modules"), { recursive: true, dereference: false });

    let error = null;
    try {
      execFileSync("npx", ["vite", "build"], { cwd: dir, stdio: "pipe" });
    } catch (cause) {
      error = `build failed: ${String(cause.stderr ?? cause.message).slice(0, 400)}`;
    }

    const dist = join(dir, "dist");
    const produced = error || !existsSync(dist) ? [] : filesUnder(dist);
    const manifestPath = join(dist, "manifest.json");
    const emitted = !error && existsSync(manifestPath);

    builds.push({
      flags,
      error,
      emitted,
      referenced: emitted ? referencedPaths(JSON.parse(readFileSync(manifestPath, "utf-8"))) : [],
      produced,
    });
  }
  return builds;
}

async function main() {
  const templates = extensionSkeletons();
  if (templates.length === 0) {
    console.error(
      "check-manifest-assets: no skeleton builds a browser-extension manifest. Either " +
        "the catalog ships no extension, or `manifest_version` has moved and this gate " +
        "now checks nothing.",
    );
    process.exit(1);
  }

  const workRoot = join(ROOT, ".manifest-assets-work");
  rmSync(workRoot, { recursive: true, force: true });
  mkdirSync(workRoot, { recursive: true });

  const failures = [];
  let checked = 0;
  let withManifest = 0;

  for (const template of templates) {
    let builds;
    try {
      builds = await manifestsPerBuild(template, join(workRoot, template));
    } catch (cause) {
      failures.push(`${template}: ${cause.message}`);
      continue;
    }

    for (const build of builds) {
      checked += 1;
      if (build.error) {
        failures.push(`${template} (${describe(build.flags)}): ${build.error}`);
        console.log(`  BROKEN   ${template}  ${describe(build.flags)}`);
        continue;
      }
      if (!build.emitted) {
        console.log(`  no manifest  ${template}  ${describe(build.flags)}`);
        continue;
      }
      withManifest += 1;

      const missing = build.referenced.filter((p) => !build.produced.includes(p));
      console.log(
        `  ${missing.length === 0 ? "provided" : "MISSING "}  ${template}  ${describe(build.flags)}` +
          `  (${build.referenced.length} path(s) named)`,
      );
      for (const path of missing) {
        failures.push(
          `${template} (${describe(build.flags)}): the manifest names "${path}" and the build ` +
            "emitted no such file, so the extension installs and that part of it never runs.",
        );
      }
    }
  }

  rmSync(workRoot, { recursive: true, force: true });

  if (withManifest === 0 && failures.length === 0) {
    console.error("check-manifest-assets: no build emitted a manifest, so nothing was checked.");
    process.exit(1);
  }

  if (failures.length > 0) {
    console.error("");
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }

  console.log(
    `\ncheck-manifest-assets: ${checked} rendered build(s) built, ${withManifest} emitting a ` +
      "manifest, and every file each manifest names was emitted by the build that named it.\n" +
      "\n" +
      "What a manifest points at outside the build output — a URL, a path resolved at run " +
      "time — is not checked here, because the build cannot answer for it.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
