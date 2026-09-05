import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import _ts from "typescript";
import { assertionDispatches, isAnAssertion, originOf } from "../check-assertion-dispatch.mjs";

const ts = _ts.default ?? _ts;

const ROOT = new URL("../..", import.meta.url).pathname;
const TEMPLATES = join(ROOT, "templates");

/**
 * The gate calls each dispatch and judges what came back, so what these pin is
 * that it reaches every dispatch the catalog ships and none of the switches
 * that are not one. A dispatch it cannot reach is a dispatch it cannot check,
 * and a verdict over nothing reads the same as a verdict over everything.
 */

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/** Every `<x>.type` switch in every skeleton, classified or not. */
function everyTypeSwitch() {
  const found = [];
  for (const template of readdirSync(TEMPLATES).sort()) {
    const src = join(TEMPLATES, template, "skeleton", "src");
    try {
      if (!statSync(src).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const path of sourceFiles(src)) {
      const sourceFile = ts.createSourceFile(
        path,
        readFileSync(path, "utf-8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node) => {
        if (
          ts.isSwitchStatement(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "type" &&
          ts.isIdentifier(node.expression.expression)
        ) {
          const discriminant = node.expression.expression.text;
          found.push({
            file: relative(ROOT, path),
            discriminant,
            classified: isAnAssertion(originOf(discriminant, node, sourceFile)),
          });
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
  }
  return found;
}

/**
 * The switches that dispatch a case assertion, named by the file they are in.
 * A skeleton that adds an eval runner belongs here; one that moves its
 * dispatch out of the gate's reach fails the enumeration below.
 */
const DISPATCHES_AN_ASSERTION = new Set([
  "templates/a2a-agent/skeleton/src/eval/runner.ts",
  "templates/agent-orchestrator/skeleton/src/orchestrator/eval/assertions.ts",
  "templates/agentic-loop/skeleton/src/eval/runner.ts",
  "templates/data-pipeline/skeleton/src/pipeline/eval/assertions.ts",
  "templates/fine-tune-pipeline/skeleton/src/eval/assertions.ts",
  "templates/llm-wiki/skeleton/src/eval/runner.ts",
  "templates/multimodal-pipeline/skeleton/src/eval/runner.ts",
  "templates/rag-pipeline/skeleton/src/eval/assertions.ts",
]);

describe("scope", () => {
  it("classifies every `.type` switch the catalog contains", () => {
    const wrong = [];
    for (const s of everyTypeSwitch()) {
      const expected = DISPATCHES_AN_ASSERTION.has(s.file);
      if (s.classified !== expected) {
        wrong.push(
          `${s.file}: switch on ${s.discriminant}.type classified ${s.classified}, expected ${expected}`,
        );
      }
    }
    assert.deepEqual(wrong, []);
  });

  it("finds a `.type` switch that is not an assertion dispatch to prove against", () => {
    // Without one, "recognises assertion dispatches" is indistinguishable from
    // "recognises every switch".
    const others = everyTypeSwitch().filter((s) => !DISPATCHES_AN_ASSERTION.has(s.file));
    assert.ok(others.length > 0, "no unrelated `.type` switch in the catalog to prove against");
  });

  it("covers both ways a dispatch binds its assertion", () => {
    // A parameter annotated `CaseAssertion`, and a `for...of` over a case's
    // assertions, which carries no annotation. A classifier reading only the
    // first misses the second entirely.
    const files = new Set(assertionDispatches().map((d) => `${d.template}/${d.path}`));
    assert.ok(
      files.has("rag-pipeline/src/eval/assertions.ts"),
      "no annotated-parameter dispatch found",
    );
    assert.ok(files.has("agentic-loop/src/eval/runner.ts"), "no for-of dispatch found");
  });
});

describe("what the gate can call", () => {
  it("finds every dispatch exported, with the types it implements", () => {
    const dispatches = assertionDispatches();
    assert.ok(dispatches.length > 0, "a gate over no dispatch reports the same as one over all");

    for (const dispatch of dispatches) {
      assert.ok(
        dispatch.exported,
        `${dispatch.template}/${dispatch.path}: ${dispatch.exportName} is not exported, so nothing can call it`,
      );
      assert.ok(
        dispatch.implemented.length > 0,
        `${dispatch.template}/${dispatch.path}: no implemented type to call as a control`,
      );
      assert.ok(
        dispatch.parameters.some((p) => p && /Assertion|Case/.test(p)),
        `${dispatch.template}/${dispatch.path}: no parameter takes an assertion or a case, so the gate has nothing to pass one through`,
      );
    }
  });
});

describe("originOf", () => {
  const parse = (source) => ts.createSourceFile("f.ts", source, ts.ScriptTarget.Latest, true);

  const switchIn = (sourceFile) => {
    let found = null;
    const visit = (n) => {
      if (!found && ts.isSwitchStatement(n)) found = n;
      ts.forEachChild(n, visit);
    };
    visit(sourceFile);
    return found;
  };

  const originIn = (source, name) => {
    const sourceFile = parse(source);
    return originOf(name, switchIn(sourceFile), sourceFile);
  };

  it("reads an annotated parameter", () => {
    const o = originIn(
      "function f(a: CaseAssertion) { switch (a.type) { case 'x': break; } }",
      "a",
    );
    assert.deepEqual(o, { kind: "declared", text: "CaseAssertion" });
    assert.equal(isAnAssertion(o), true);
  });

  it("reads a for-of binding through the expression it iterates", () => {
    const o = originIn(
      "function f(c: EvalCase) { for (const a of c.assertions) { switch (a.type) { case 'x': break; } } }",
      "a",
    );
    assert.deepEqual(o, { kind: "iterated", text: "c.assertions" });
    assert.equal(isAnAssertion(o), true);
  });

  it("does not read an unrelated binding as an assertion", () => {
    assert.equal(
      isAnAssertion(originIn("function f(m: WebviewMessage) { switch (m.type) {} }", "m")),
      false,
    );
    assert.equal(
      isAnAssertion(
        originIn("function f(c: Doc) { for (const b of c.blocks) { switch (b.type) {} } }", "b"),
      ),
      false,
    );
    assert.equal(isAnAssertion(originIn("function f(x) { switch (x.type) {} }", "x")), false);
  });
});
