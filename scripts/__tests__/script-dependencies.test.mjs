import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { declaredPackages, importedPackages, packageOf } from "../check-script-dependencies.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;

/**
 * The gate resolves against the manifest rather than against `node_modules`,
 * because a tree with the package installed and undeclared is the state it
 * exists to catch — and that tree resolves the import perfectly well.
 */

describe("packageOf", () => {
  it("names the package a specifier reaches for", () => {
    assert.equal(packageOf("typescript"), "typescript");
    assert.equal(packageOf("ajv/dist/2020.js"), "ajv");
    assert.equal(packageOf("@biomejs/biome"), "@biomejs/biome");
    assert.equal(packageOf("@scope/pkg/deep/path.js"), "@scope/pkg");
  });

  it("names nothing for a builtin or a relative path", () => {
    assert.equal(packageOf("node:fs"), null);
    assert.equal(packageOf("fs"), null);
    assert.equal(packageOf("./sibling.mjs"), null);
    assert.equal(packageOf("../parent.mjs"), null);
  });
});

describe("importedPackages", () => {
  it("finds what the repository's own scripts import", () => {
    const found = importedPackages(join(ROOT, "scripts"));
    assert.ok(found.size > 0, "a gate over no import reports the same as one over all");
    assert.ok(found.has("typescript"), "typescript is imported by at least one script");
  });

  it("names the scripts that reach for each package", () => {
    const found = importedPackages(join(ROOT, "scripts"));
    for (const [, files] of found) {
      assert.ok(files.length > 0);
      for (const file of files) assert.match(file, /^scripts\//);
    }
  });
});

describe("declaredPackages", () => {
  it("reads every kind of dependency list", () => {
    const declared = declaredPackages({
      dependencies: { a: "1" },
      devDependencies: { b: "1" },
      optionalDependencies: { c: "1" },
      peerDependencies: { d: "1" },
    });
    assert.deepEqual([...declared].sort(), ["a", "b", "c", "d"]);
  });

  it("reads nothing from a manifest that declares nothing", () => {
    assert.deepEqual([...declaredPackages({})], []);
  });
});

describe("the repository's own scripts", () => {
  it("import only packages the manifest declares", () => {
    // The regression: a gate was added on one branch importing a package
    // declared on another. It ran here, because this tree's node_modules was
    // populated from the other branch, and died on a clean install.
    const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
    const declared = declaredPackages(manifest);
    const undeclared = [];
    for (const [pkg, files] of importedPackages(join(ROOT, "scripts"))) {
      if (!declared.has(pkg)) undeclared.push(`${pkg} (imported by ${files.join(", ")})`);
    }
    assert.deepEqual(undeclared, []);
  });
});
