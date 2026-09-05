import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { moduleSpecifiers, relativeImports, SOURCE_FILE } from "../check-conditional-renders.mjs";

// A gate deciding by pattern over source is a claim about the shapes the tree
// contains. These pin the claim: the extractor is run against every import
// shape the catalog writes, so one it cannot see fails here rather than
// leaving a broken render unlisted.
//
// The regression this exists for: a pattern that forbade a newline between
// `import` and `from` was blind to every specifier list wrapped across lines,
// which is what a formatter produces once a list grows, and to dynamic
// `import()` entirely.

const ROOT = new URL("../..", import.meta.url).pathname;
const TEMPLATES = join(ROOT, "templates");
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", "build", ".turbo"]);

function walk(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, acc);
    else acc.push(relative(base, full).split("\\").join("/"));
  }
  return acc;
}

function catalogSources() {
  const out = [];
  for (const name of readdirSync(TEMPLATES).sort()) {
    const skeleton = join(TEMPLATES, name, "skeleton");
    let files;
    try {
      files = walk(skeleton);
    } catch {
      continue;
    }
    for (const file of files) {
      // The gate's own set, not a second list beside it.
      if (!SOURCE_FILE.test(file)) continue;
      out.push({ template: name, file, source: readFileSync(join(skeleton, file), "utf-8") });
    }
  }
  return out;
}

describe("moduleSpecifiers", () => {
  // Each of these is a shape the catalog writes. The counts beside them are
  // not asserted — what is asserted is that every shape is seen at all.
  const SHAPES = [
    ["a default import", 'import a from "./a.js";', ["./a.js"]],
    ["a named import", 'import { a } from "./a.js";', ["./a.js"]],
    [
      "a named import wrapped across lines",
      'import {\n  aLongName,\n  anotherLongName,\n} from "./a.js";',
      ["./a.js"],
    ],
    ["a type-only import", 'import type { A } from "./a.js";', ["./a.js"]],
    ["a side-effect import", 'import "./register.js";', ["./register.js"]],
    ["a namespace import", 'import * as a from "./a.js";', ["./a.js"]],
    ["a re-export", 'export { a } from "./a.js";', ["./a.js"]],
    ["a type-only re-export", 'export type { A } from "./a.js";', ["./a.js"]],
    ["a star re-export", 'export * from "./a.js";', ["./a.js"]],
    ["a dynamic import", 'const m = await import("./a.js");', ["./a.js"]],
    [
      "a dynamic import inside a function",
      'async function f() {\n  const { a } = await import("./a.js");\n  return a;\n}',
      ["./a.js"],
    ],
    ["a require call", 'const a = require("./a.js");', ["./a.js"]],
    ["a bare specifier", 'import a from "vscode";', ["vscode"]],
    [
      "several in one file",
      'import a from "./a.js";\nexport * from "./b.js";',
      ["./a.js", "./b.js"],
    ],
  ];

  for (const [name, source, expected] of SHAPES) {
    it(`sees ${name}`, () => {
      assert.deepEqual(moduleSpecifiers(source, "sample.ts").sort(), [...expected].sort());
    });
  }

  it("reads every file the catalog ships without throwing", () => {
    const sources = catalogSources();
    assert.ok(sources.length > 0, "found no catalog sources — the walk is broken");
    for (const { template, file, source } of sources) {
      assert.doesNotThrow(
        () => moduleSpecifiers(source, file),
        `${template}/${file} could not be read for its imports`,
      );
    }
  });

  it("sees at least as many specifiers as a text scan finds", () => {
    // Derived from the tree rather than sampled: over every catalog file, a
    // text scan for `from "…"` finds a lower bound on the specifiers, and an
    // extractor reporting fewer has missed one. The extractor may report more,
    // because a dynamic import carries no `from`.
    //
    // Comments are stripped first. Skeletons document their own usage with
    // import examples, and a scan that counted those would be measuring the
    // documentation rather than the code.
    const shortfalls = [];
    for (const { template, file, source } of catalogSources()) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
      const byText = new Set([...code.matchAll(/from\s*["']([^"'\n]+)["']/g)].map((m) => m[1]));
      const byParse = new Set(moduleSpecifiers(source, file));
      for (const specifier of byText) {
        if (!byParse.has(specifier)) shortfalls.push(`${template}/${file}: ${specifier}`);
      }
    }
    assert.deepEqual(shortfalls, []);
  });

  it("finds a wrapped specifier list somewhere in the catalog", () => {
    // The shape the previous matcher was blind to. If the catalog stops
    // containing it, this stops proving anything and should be replaced by
    // whatever shape has taken its place.
    const wrapped = catalogSources().filter(({ source }) =>
      /(?:import|export)\s*\{[^}]*\n[^}]*\}\s*from/.test(source),
    );
    assert.ok(wrapped.length > 0, "no wrapped specifier list in the catalog to prove against");
  });

  it("finds a dynamic import somewhere in the catalog", () => {
    const dynamic = catalogSources().filter(({ source }) => /await import\(/.test(source));
    assert.ok(dynamic.length > 0, "no dynamic import in the catalog to prove against");
  });
});

describe("relativeImports", () => {
  it("keeps relative specifiers and drops packages", () => {
    const source = 'import a from "./a.js";\nimport b from "../b.js";\nimport c from "vscode";';
    assert.deepEqual(relativeImports(source, "sample.ts").sort(), ["../b.js", "./a.js"]);
  });
});
