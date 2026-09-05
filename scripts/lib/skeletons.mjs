//
// skeletons.mjs — the corpus every skeleton-facing gate reads.
//
// One walk, imported rather than repeated. Two gates with a discovery each
// disagree the moment one is deepened and the other is not, and the one left
// behind goes on reporting success over the smaller corpus.
//

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

/**
 * Directories holding what a build produced rather than what a skeleton ships.
 *
 * Exported because a gate that resolves a pattern against the walk's output has
 * to know which directories the walk declined to enter. Deriving that from this
 * set is what keeps a directory from being invisible to the walk and required
 * by a check at the same time.
 */
export const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo", "build"]);

const CONFIG_NAME = /^vitest\.config\.(m|c)?(t|j)s$/;

/** Every file under a directory, as directory-relative POSIX paths. */
export function skeletonFiles(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) skeletonFiles(full, base, acc);
    else acc.push(relative(base, full).split("\\").join("/"));
  }
  return acc;
}

/** Every `templates/<name>/skeleton` directory. */
export function skeletonRoots(root) {
  const templatesDir = join(root, "templates");
  const roots = [];
  for (const name of readdirSync(templatesDir).sort()) {
    const skeleton = join(templatesDir, name, "skeleton");
    if (existsSync(skeleton) && statSync(skeleton).isDirectory()) roots.push(skeleton);
  }
  return roots;
}

/**
 * Every vitest config under a skeleton, at any depth.
 *
 * A skeleton's code does not always sit at its root: a monorepo template puts
 * packages under `packages/` and a library template puts one under `sdk/`. A
 * walk fixed at `templates/*​/skeleton/vitest.config.ts` reads the skeletons
 * whose shape someone anticipated, and moving that path down one directory only
 * relocates where the next corpus goes quiet. So the walk enumerates, and
 * `skeletonsDeclaringVitest` gives it something to be answerable to.
 */
export function skeletonConfigs(root) {
  const found = [];
  for (const skeleton of skeletonRoots(root)) {
    for (const rel of skeletonFiles(skeleton)) {
      if (CONFIG_NAME.test(basename(rel))) found.push(join(skeleton, rel));
    }
  }
  return found.sort();
}

/**
 * The directories under a skeleton whose manifest declares vitest.
 *
 * A package that declares vitest is a package with a suite, and a suite is
 * measured by a config beside its manifest. That makes this the independent
 * account of what the walk owes: it is derived from the manifests rather than
 * from the walk, so a config the walk cannot reach is a directory this names
 * and the walk does not. A discovery answerable only to itself reports success
 * over whatever it happens to find.
 */
export function skeletonsDeclaringVitest(root) {
  const found = [];
  for (const skeleton of skeletonRoots(root)) {
    for (const rel of skeletonFiles(skeleton)) {
      if (basename(rel) !== "package.json") continue;
      const full = join(skeleton, rel);
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(full, "utf-8"));
      } catch {
        // A manifest that does not parse is a broken skeleton rather than a
        // package without a suite, and reading the two as the same thing is how
        // a config leaves the walk with nothing saying so.
        found.push({ dir: dirname(full), unreadable: true });
        continue;
      }
      const declared = { ...manifest.devDependencies, ...manifest.dependencies };
      if (declared.vitest) found.push({ dir: dirname(full), unreadable: false });
    }
  }
  return found;
}

/**
 * The configs a walk owes but did not reach.
 *
 * The whole of the accounting, in one place, so both gates refuse the same
 * corpus rather than each deciding for itself what a complete one looks like.
 */
export function unaccountedSkeletons(root, configs) {
  const reached = new Set(configs.map((c) => dirname(c)));
  return skeletonsDeclaringVitest(root).filter((d) => !reached.has(d.dir));
}
