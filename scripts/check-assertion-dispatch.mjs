#!/usr/bin/env node
/**
 * Every assertion dispatch must refuse a type it does not implement.
 *
 * A case file is JSON. The assertion union in a skeleton's TypeScript
 * constrains what the loader accepts and nothing else, so a type outside it
 * reaches the dispatch at run time. A dispatch that drops it produces no
 * result, and a case's verdict is `every` over its results — `every` over an
 * empty list is true. A case built from types nothing implements is then
 * reported green having checked nothing, which is the outcome the eval suites
 * exist to make impossible.
 *
 * That property is about behaviour, so this observes behaviour: each dispatch
 * is loaded and called with an assertion whose type nothing implements, and
 * what it returned is what decides the verdict. Reading the source for a
 * default arm would accept a refusal written where nothing reaches it.
 *
 * Each dispatch is called twice. The second call uses a type it does
 * implement, and its outcome must differ from the first — without that, a
 * harness that fails to reach the dispatch at all would report every one of
 * them as refusing.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import _ts from "typescript";

const ts = _ts.default ?? _ts;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(ROOT, "templates");

/** The type nothing implements. */
const UNIMPLEMENTED = "__no_such_assertion_type__";

/** A declared type naming an assertion, and one naming a case. */
const ASSERTION_TYPE = /Assertion/;
const CASE_TYPE = /Case/;

/** The property a case exposes its assertions through. */
const ASSERTION_LIST = /(^|\.)assertions$/;

const SOURCE_FILE = /\.tsx?$/;

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (SOURCE_FILE.test(entry)) out.push(path);
  }
  return out;
}

/**
 * A stand-in for an argument this gate has no shape for. The dispatch reads it
 * before reaching the switch — a plan's subtask count, an outcome's answer —
 * and the hostile call never enters an implemented arm, so what it reads back
 * only has to be inert rather than right.
 */
function probe() {
  const target = () => probe();
  return new Proxy(target, {
    get(_t, key) {
      if (key === "length") return 0;
      if (key === Symbol.iterator) return function* () {};
      if (key === Symbol.toPrimitive || key === "toString") return () => "";
      if (key === "then") return undefined;
      return probe();
    },
    apply: () => probe(),
    construct: () => probe(),
  });
}

/** A module outside the loaded tree. */
function inert() {
  return probe();
}

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

function resolveIn(specifier, fromPath, files) {
  const base = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  const candidates = [base, base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx")];
  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
    for (const ext of EXTENSIONS) {
      if (files.has(candidate + ext)) return candidate + ext;
      const index = posix.join(candidate, `index${ext}`);
      if (files.has(index)) return index;
    }
  }
  return null;
}

/**
 * Load a skeleton module and everything it reaches by relative path. Packages
 * are inert, so a dispatch can be called without installing what its runner
 * would need to reach a model.
 */
function loadModule(entry, files, cache = new Map()) {
  if (cache.has(entry)) return cache.get(entry);
  const exports = {};
  cache.set(entry, exports);

  const transpiled = ts
    .transpileModule(files.get(entry), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: entry,
    })
    // A runner reads its corpus directory relative to its own module. The
    // CommonJS wrapper this is evaluated in has no `import.meta`, so it is
    // bound to a stand-in — the dispatch under test never reads a corpus, and
    // a module that fails to load is what the control call below catches.
    .outputText.replaceAll("import.meta", "__importMeta");

  const require_ = (specifier) => {
    if (!specifier.startsWith(".")) return inert();
    const resolved = resolveIn(specifier, entry, files);
    return resolved ? loadModule(resolved, files, cache) : inert();
  };

  const module = { exports };
  const importMeta = { url: `file:///${entry}`, dirname: posix.dirname(entry) };
  new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    "__importMeta",
    transpiled,
  )(exports, require_, module, entry, posix.dirname(entry), importMeta);
  cache.set(entry, module.exports);
  return module.exports;
}

/** An argument for a parameter, chosen by the type it declares. */
function argumentFor(declaredType, assertion) {
  if (!declaredType) return probe();
  if (ASSERTION_TYPE.test(declaredType)) return assertion;
  if (CASE_TYPE.test(declaredType)) {
    return { name: "probe", kind: "golden", input: "", assertions: [assertion] };
  }
  return probe();
}

/** Everything the gate needs to call one dispatch, read out of its source. */
export function describeDispatch(sourceFile, node) {
  let fn = node.parent;
  while (fn && !ts.isFunctionDeclaration(fn) && !ts.isMethodDeclaration(fn)) fn = fn.parent;
  if (!fn?.name) return null;

  const exported = fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const implemented = node.caseBlock.clauses
    .filter(ts.isCaseClause)
    .map((clause) => (ts.isStringLiteral(clause.expression) ? clause.expression.text : null))
    .filter(Boolean);

  return {
    exportName: fn.name.text,
    exported: Boolean(exported),
    parameters: fn.parameters.map((p) => (p.type ? p.type.getText(sourceFile) : null)),
    implemented,
  };
}

/** Where a switched-on binding came from: its declared type, or a for-of source. */
export function originOf(name, from, sourceFile) {
  for (let node = from; node; node = node.parent) {
    if (ts.isForOfStatement(node)) {
      const [binding] = node.initializer.declarations ?? [];
      if (binding && ts.isIdentifier(binding.name) && binding.name.text === name) {
        return { kind: "iterated", text: node.expression.getText(sourceFile) };
      }
    }
    const declarations = [];
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      declarations.push(...node.parameters);
    }
    if (ts.isBlock(node) || ts.isSourceFile(node)) {
      for (const statement of node.statements) {
        if (ts.isVariableStatement(statement)) {
          declarations.push(...statement.declarationList.declarations);
        }
      }
    }
    for (const declaration of declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        return declaration.type
          ? { kind: "declared", text: declaration.type.getText(sourceFile) }
          : null;
      }
    }
  }
  return null;
}

/** Is a binding with this origin holding a case assertion? */
export function isAnAssertion(origin) {
  if (!origin) return false;
  if (origin.kind === "declared") return ASSERTION_TYPE.test(origin.text);
  return ASSERTION_LIST.test(origin.text);
}

/** Every assertion dispatch the catalog ships, with what it takes to call one. */
export function assertionDispatches() {
  const found = [];
  for (const template of readdirSync(TEMPLATES).sort()) {
    const src = join(TEMPLATES, template, "skeleton", "src");
    try {
      if (!statSync(src).isDirectory()) continue;
    } catch {
      continue;
    }
    const files = new Map(
      sourceFiles(src).map((path) => [
        relative(join(TEMPLATES, template, "skeleton"), path),
        readFileSync(path, "utf-8"),
      ]),
    );
    for (const [path, text] of files) {
      const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      const visit = (node) => {
        if (
          ts.isSwitchStatement(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "type" &&
          ts.isIdentifier(node.expression.expression) &&
          isAnAssertion(originOf(node.expression.expression.text, node, sourceFile))
        ) {
          const described = describeDispatch(sourceFile, node);
          if (described) found.push({ template, path, files, ...described });
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
  }
  return found;
}

/** Call a dispatch with one assertion and report what came back. */
async function callWith(dispatch, assertion) {
  let fn;
  try {
    fn = loadModule(dispatch.path, dispatch.files)[dispatch.exportName];
  } catch (cause) {
    return { threw: `loading ${dispatch.path}: ${cause.message}` };
  }
  if (typeof fn !== "function") {
    return { threw: `${dispatch.path} exports no callable ${dispatch.exportName}` };
  }

  const args = dispatch.parameters.map((type) => argumentFor(type, assertion));
  try {
    const returned = await fn(...args);
    const results = Array.isArray(returned) ? returned : [returned];
    return { results: results.filter((r) => r && typeof r === "object") };
  } catch (cause) {
    return { threw: cause.message };
  }
}

/** Did this outcome refuse the assertion? */
function refused(outcome) {
  // A dispatch that throws on a type it does not implement has refused it: the
  // case fails rather than scoring a pass over nothing.
  if (outcome.threw) return true;
  return outcome.results.length > 0 && outcome.results.every((r) => r.pass === false);
}

/** What an outcome looks like, for comparing the hostile call to the control. */
function shape(outcome) {
  if (outcome.threw) return `threw:${outcome.threw}`;
  return outcome.results.map((r) => `${r.pass}:${r.message ?? ""}`).join("|");
}

async function main() {
  const dispatches = assertionDispatches();

  if (dispatches.length === 0) {
    console.error(
      "check-assertion-dispatch: no assertion dispatch found in any skeleton. " +
        "Either the catalog ships no eval runner, or the discriminant this gate " +
        "derives scope from has been renamed and the gate now checks nothing.",
    );
    process.exit(1);
  }

  const failures = [];

  for (const dispatch of dispatches) {
    const where = `${dispatch.template} ${dispatch.path}`;

    if (!dispatch.exported) {
      console.log(`  UNCALLED  ${where}`);
      failures.push(
        `${where}: ${dispatch.exportName} is not exported, so nothing can call it with a type it does not implement.`,
      );
      continue;
    }

    const hostile = await callWith(dispatch, { type: UNIMPLEMENTED, value: "probe" });
    const control = dispatch.implemented.length
      ? await callWith(dispatch, { type: dispatch.implemented[0], value: "probe" })
      : null;

    const ok = refused(hostile) && control !== null && shape(control) !== shape(hostile);
    console.log(`  ${ok ? "refuses " : "ADMITS  "}  ${where}`);

    if (!refused(hostile)) {
      failures.push(
        hostile.results?.length === 0
          ? `${where}: called with type "${UNIMPLEMENTED}" it produced no result at all, so a case built from types nothing implements is every-of-an-empty-list — which passes.`
          : `${where}: called with type "${UNIMPLEMENTED}" it returned a passing result, so an assertion nothing checks scores a pass.`,
      );
    } else if (control === null) {
      failures.push(`${where}: implements no assertion type, so there is nothing to refuse.`);
    } else if (shape(control) === shape(hostile)) {
      failures.push(
        `${where}: a type it implements produces the same outcome as one it does not, so this gate is not reaching the dispatch and its verdict means nothing.`,
      );
    }
  }

  if (failures.length > 0) {
    console.error("");
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }

  console.log(
    `\ncheck-assertion-dispatch: ${dispatches.length} assertion dispatch(es), each called with a type ` +
      "nothing implements and each refusing it, and each answering differently to one it implements.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
