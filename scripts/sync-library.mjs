#!/usr/bin/env node
/**
 * Vendor the tenant-chart-base library chart into every consumer chart that
 * declares it as a `file://charts/tenant-chart-base` dependency.
 *
 * The SDK renders skeleton files and never runs `helm`, so a consumer can't
 * fetch a library dependency at build time — it carries a vendored copy under
 * `chart/charts/tenant-chart-base/`. The library template is the single source
 * of truth; this script keeps the copies identical to it.
 *
 *   node scripts/sync-library.mjs            # write the vendored copies
 *   node scripts/sync-library.mjs --check    # CI gate: exit 1 if any copy drifted
 */
import { readdir, readFile, rm, cp, stat } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB_NAME = 'tenant-chart-base';
const LIB_SRC = join(ROOT, 'templates', LIB_NAME, 'skeleton', 'chart');
const TEMPLATES_DIR = join(ROOT, 'templates');
const CHECK = process.argv.includes('--check');

/** Recursively list files under a dir, relative to it (sorted). */
async function listFiles(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p, base)));
    else out.push(relative(base, p));
  }
  return out.sort();
}

/** Find consumer chart directories: a skeleton Chart.yaml that declares the file:// dep. */
async function findConsumers() {
  const dirs = [];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'charts') continue; // don't descend into vendored copies
        await walk(p);
      } else if (e.name === 'Chart.yaml') {
        if ((await readFile(p, 'utf8')).includes(`file://charts/${LIB_NAME}`))
          dirs.push(dirname(p));
      }
    }
  }
  for (const e of await readdir(TEMPLATES_DIR, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === LIB_NAME) continue;
    const skel = join(TEMPLATES_DIR, e.name, 'skeleton');
    try {
      await stat(skel);
    } catch {
      continue;
    }
    await walk(skel);
  }
  return dirs;
}

async function main() {
  const consumers = await findConsumers();
  if (consumers.length === 0) {
    console.log(`no consumer declares file://charts/${LIB_NAME} yet (nothing to vendor)`);
    return;
  }
  const srcFiles = await listFiles(LIB_SRC);
  let drift = 0;
  for (const chartDir of consumers) {
    const dest = join(chartDir, 'charts', LIB_NAME);
    const rel = relative(ROOT, dest);
    if (CHECK) {
      let copyFiles;
      try {
        copyFiles = await listFiles(dest);
      } catch {
        copyFiles = null;
      }
      const same =
        copyFiles &&
        copyFiles.join('\n') === srcFiles.join('\n') &&
        (
          await Promise.all(
            srcFiles.map(
              async (f) =>
                (await readFile(join(LIB_SRC, f), 'utf8')) ===
                (await readFile(join(dest, f), 'utf8')),
            ),
          )
        ).every(Boolean);
      if (same) {
        console.log(`ok  ${rel}`);
      } else {
        console.error(`DRIFT  ${rel} — run \`npm run sync:library\``);
        drift++;
      }
    } else {
      await rm(dest, { recursive: true, force: true });
      await cp(LIB_SRC, dest, { recursive: true });
      console.log(`vendored ${LIB_NAME} -> ${rel}`);
    }
  }
  if (CHECK && drift > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
