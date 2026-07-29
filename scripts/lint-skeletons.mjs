#!/usr/bin/env node
/**
 * Run Biome over every scaffoldable skeleton, each against its own config.
 *
 * The root `biome.json` excludes `templates/&#42;/skeleton` — it has to, because a
 * skeleton is scaffolding output with its own root, its own build directories
 * and its own config. The consequence is that the catalog's source was the one
 * part of this repository nothing linted, which is how a published template
 * came to ship a floating promise in a queue worker's dispatch loop and an
 * `expect((x?.y as T).z)` that throws a TypeError instead of failing an
 * assertion.
 *
 * A skeleton is what a consumer's project starts as. `npm run lint` has to pass
 * on the first commit of a scaffolded project, and this is what proves it —
 * running the same command, from the same directory, against the same config a
 * consumer would get.
 *
 *   node scripts/lint-skeletons.mjs
 *
 * Companion to `check-skeleton-toolchain.mjs`, which asserts every skeleton
 * *has* the shared config. This one asserts the code passes it.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(ROOT, "templates");
const BIOME = join(ROOT, "node_modules", ".bin", "biome");

try {
  statSync(BIOME);
} catch {
  console.error(`lint-skeletons: no biome binary at ${relative(ROOT, BIOME)} — run \`npm ci\``);
  process.exit(1);
}

const skeletons = readdirSync(TEMPLATES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => join(TEMPLATES, e.name, "skeleton"))
  .filter((dir) => {
    try {
      return statSync(join(dir, "biome.json")).isFile();
    } catch {
      return false;
    }
  });

// A glob that stopped matching would report the whole catalog clean.
if (skeletons.length === 0) {
  console.error("lint-skeletons: found no skeleton carrying a biome.json — the scan is broken");
  process.exit(1);
}

const failed = [];
for (const dir of skeletons) {
  const result = spawnSync(BIOME, ["check", "."], { cwd: dir, encoding: "utf8" });
  if (result.status !== 0) {
    failed.push(relative(ROOT, dir));
    process.stderr.write(`\n══ ${relative(ROOT, dir)}\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
}

if (failed.length > 0) {
  console.error(
    `\nlint-skeletons: ${failed.length} of ${skeletons.length} skeleton(s) do not pass their own lint:\n` +
      `${failed.map((d) => `  ✗ ${d}`).join("\n")}\n\n` +
      "A scaffolded project has to be clean on its first commit. Fix the skeleton.\n",
  );
  process.exit(1);
}

console.log(`lint-skeletons: ${skeletons.length} skeleton(s) pass Biome against their own config`);
