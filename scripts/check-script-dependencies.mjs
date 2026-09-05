#!/usr/bin/env node
/**
 * Every package a repository script imports must be one the install provides.
 *
 * A script that names an undeclared package runs for whoever already has it —
 * a developer whose `node_modules` was populated from another branch, most
 * often — and dies with ERR_MODULE_NOT_FOUND on a clean `npm ci`. Nothing else
 * in the repository sees it: the script's own tests import the same package
 * and fail the same way, so a green local run says only that the machine has
 * it, not that the manifest does.
 *
 * Resolution is against the manifest rather than against `node_modules`,
 * because `node_modules` is the thing that is wrong. A tree with the package
 * installed and undeclared resolves it and reports nothing, which is the state
 * this exists to catch.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import _ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// TypeScript ships CommonJS; the ESM shim exposes the API as the default.
const ts = _ts.default ?? _ts;

const BUILTIN = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

const SCRIPT_FILE = /\.mjs$/;

/**
 * Bare specifiers in static and dynamic imports, and in `export … from`, read
 * from the parse.
 *
 * A regex over the source finds import syntax wherever it appears, including
 * inside a string — and a script whose subject is imports writes them as
 * fixtures. `'import a from "vscode";'` is a test's input, not this
 * repository's dependency, and a gate that cannot tell the two apart reports a
 * package nobody imports while a real import written across a line break goes
 * unseen.
 */
function specifiersOf(source, fileName) {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

/** The package a specifier names: `@scope/name/sub` → `@scope/name`. */
export function packageOf(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  if (BUILTIN.has(specifier)) return null;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Every package the scripts in `dir` import. */
export function importedPackages(dir) {
  const found = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules") continue;
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (SCRIPT_FILE.test(entry)) {
        const source = readFileSync(path, "utf-8");
        for (const specifier of specifiersOf(source, path)) {
          const pkg = packageOf(specifier);
          if (!pkg) continue;
          if (!found.has(pkg)) found.set(pkg, []);
          found.get(pkg).push(relative(ROOT, path));
        }
      }
    }
  };
  walk(dir);
  return found;
}

/** Everything the root manifest declares, by any kind of dependency. */
export function declaredPackages(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
}

function main() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  const declared = declaredPackages(manifest);
  const imported = importedPackages(join(ROOT, "scripts"));

  if (imported.size === 0) {
    console.error(
      "check-script-dependencies: no script imports any package. Either scripts/ " +
        "holds nothing that reaches for a dependency, or the import reader has stopped " +
        "matching and this gate now checks nothing.",
    );
    process.exit(1);
  }

  const undeclared = [];
  for (const [pkg, files] of [...imported].sort()) {
    const ok = declared.has(pkg);
    console.log(`  ${ok ? "declared  " : "UNDECLARED"}  ${pkg}  (${files.length} script(s))`);
    if (!ok) {
      undeclared.push(
        `${pkg} is imported by ${[...new Set(files)].join(", ")} and is in no dependency ` +
          "list, so those scripts die on a clean install.",
      );
    }
  }

  if (undeclared.length > 0) {
    console.error("");
    for (const line of undeclared) console.error(line);
    process.exit(1);
  }

  console.log(
    `\ncheck-script-dependencies: ${imported.size} package(s) imported across scripts/, ` +
      "each declared in the root manifest. Resolution is against the manifest, not " +
      "against node_modules, so a package that is installed and undeclared still fails.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
