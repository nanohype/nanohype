#!/usr/bin/env node
/**
 * Every command a scaffolded extension contributes must be registered in the
 * build that ships it.
 *
 * `contributes.commands` in a VS Code manifest is JSON and carries no
 * conditional, so the Command Palette offers every entry in every build. A
 * build whose `activate` does not reach one fails with an unknown-command
 * error when it is chosen, which reads to the user like a broken install.
 *
 * The pairing has to be measured on a rendered build. A skeleton is checked in
 * with both arms of each conditional block present, so a suite running there
 * sees a command registered even when the arm that a given build keeps does
 * not register it — a state no consumer receives. This renders each
 * combination of a template's bool variables, loads the rendered entry point
 * with `vscode` stubbed, calls `activate`, and asks what it registered.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import _ts from "typescript";

const ts = _ts.default ?? _ts;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(ROOT, "templates");

/** A module that is not part of the rendered tree. */
function stubModule(name, registered, configReads) {
  if (name !== "vscode") return inert();

  const modelled = {
    commands: {
      registerCommand(id) {
        registered.push(id);
        return { dispose() {} };
      },
      executeCommand() {},
    },
    window: new Proxy({}, { get: () => () => undefined }),
    workspace: {
      getConfiguration(section) {
        return {
          get(key) {
            configReads.push(section ? `${section}.${key}` : key);
            return undefined;
          },
          update() {},
          has: () => false,
        };
      },
      onDidChangeConfiguration: () => ({ dispose() {} }),
    },
    Uri: { joinPath: (...parts) => ({ fsPath: parts.join("/"), toString: () => "" }) },
    ViewColumn: { One: 1 },
    ExtensionMode: { Test: 3 },
  };

  // Anything not modelled here answers inertly rather than throwing. An
  // extension that touches one more editor surface is not a finding, and a
  // throw would be reported as every contributed command going unregistered.
  return new Proxy(modelled, {
    get: (target, key) => (key in target ? target[key] : inert()),
  });
}

/** Something a module can be destructured from without throwing. */
function inert() {
  const fn = () => inert();
  return new Proxy(fn, {
    get: (_t, key) => (key === "then" ? undefined : inert()),
    apply: () => inert(),
    construct: () => inert(),
  });
}

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

const SOURCE_FILE = /\.(tsx?|jsx?)$/;
const TEST_FILE = /(^|\/)__tests__\/|\.(test|spec)\.[tj]sx?$/;

/** Resolve a relative specifier against the rendered file paths. */
function resolveRendered(specifier, fromPath, files) {
  const base = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  const candidates = [base, base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx")];
  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
    for (const ext of EXTENSIONS) {
      if (files.has(candidate + ext)) return candidate + ext;
      if (files.has(posix.join(candidate, `index${ext}`)))
        return posix.join(candidate, `index${ext}`);
    }
  }
  return null;
}

/**
 * Load a rendered module and everything it reaches, with `vscode` recording
 * what gets registered. Modules outside the rendered tree are inert, so a
 * dependency that would need installing does not have to be.
 */
function loadRendered(entry, files, registered, configReads, cache = new Map()) {
  if (cache.has(entry)) return cache.get(entry);
  const exports = {};
  cache.set(entry, exports);

  const transpiled = ts.transpileModule(files.get(entry), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    fileName: entry,
  }).outputText;

  const require_ = (specifier) => {
    if (!specifier.startsWith(".")) return stubModule(specifier, registered, configReads);
    const resolved = resolveRendered(specifier, entry, files);
    if (!resolved) return inert();
    return loadRendered(resolved, files, registered, configReads, cache);
  };

  const module = { exports };
  // The input is this repository's own rendered skeletons, transpiled here, and
  // the module graph this can reach is the rendered file map plus the stubs
  // above. Running the build is the point: what a manifest declares has to be
  // checked against what `activate` does, and reading the source answers what
  // its author intended instead.
  new Function("exports", "require", "module", "__filename", "__dirname", transpiled)(
    exports,
    require_,
    module,
    entry,
    posix.dirname(entry),
  );
  cache.set(entry, module.exports);
  return module.exports;
}

/**
 * The configuration keys a rendered source reads, fully qualified.
 *
 * Read from the parse rather than matched in text. The regex this replaces
 * matched a receiver literally named `config`, only with a type argument, only
 * with double quotes, and only in one file — which is a claim about the
 * spellings its author thought of, not about what the build reads.
 */
export function configurationKeysRead(source, fileName) {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  /** Local name → the section it was opened on, for `const c = getConfiguration("s")`. */
  const sections = new Map();
  const keys = new Set();

  const sectionOf = (call) => {
    const [first] = call.arguments;
    return first && ts.isStringLiteralLike(first) ? first.text : "";
  };

  const isGetConfiguration = (node) =>
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "getConfiguration";

  const qualify = (section, key) => (section ? `${section}.${key}` : key);

  const record = (node) => {
    // `getConfiguration(section).get(key)` — the whole chain in one expression.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "get"
    ) {
      const [keyArgument] = node.arguments;
      if (keyArgument && ts.isStringLiteralLike(keyArgument)) {
        const receiver = node.expression.expression;
        if (isGetConfiguration(receiver)) {
          keys.add(qualify(sectionOf(receiver), keyArgument.text));
        } else if (ts.isIdentifier(receiver) && sections.has(receiver.text)) {
          keys.add(qualify(sections.get(receiver.text), keyArgument.text));
        }
      }
    }
  };

  const bind = (node) => {
    // `const anything = <expr>.getConfiguration("section")` — the receiver's
    // name is the author's choice and carries no meaning, so it is followed
    // rather than matched.
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isGetConfiguration(node.initializer)
    ) {
      sections.set(node.name.text, sectionOf(node.initializer));
    }
  };

  const walk = (visitor) => {
    const visit = (node) => {
      visitor(node);
      ts.forEachChild(node, visit);
    };
    visit(parsed);
  };

  // Bindings first: a `.get` can appear above the `const` that opened the
  // section, and one pass in source order would miss it.
  walk(bind);
  walk(record);

  return keys;
}

/** Every combination of a manifest's bool variables. */
export function boolCombinations(manifest) {
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

/** Placeholder-free values for every non-bool variable a manifest declares. */
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
  // A name that satisfies the common kebab/identifier patterns the catalog uses.
  return pattern && !new RegExp(pattern).test("a-name") ? "aname" : "a-name";
}

/** Templates whose skeleton contributes VS Code commands. */
export function templatesContributingCommands() {
  const found = [];
  for (const template of readdirSync(TEMPLATES).sort()) {
    const pkgPath = join(TEMPLATES, template, "skeleton", "package.json");
    try {
      if (!statSync(pkgPath).isFile()) continue;
    } catch {
      continue;
    }
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (pkg.contributes?.commands?.length) found.push(template);
  }
  return found;
}

/** What each rendered build of a template contributes and what it registers. */
export async function registrationsPerBuild(template) {
  // Imported here rather than at module scope: the SDK is built during the
  // same job, and the scope helpers above are useful before it is.
  const { LocalSource, renderTemplate } = await import("../sdk/dist/index.js");
  const source = new LocalSource({ rootDir: ROOT });
  const { manifest, files } = await source.fetchTemplate(template);
  const builds = [];

  for (const flags of boolCombinations(manifest)) {
    const rendered = renderTemplate(manifest, files, { ...otherValues(manifest), ...flags });
    const byPath = new Map(rendered.files.map((f) => [f.path, f.content]));

    const pkg = JSON.parse(byPath.get("package.json"));
    const contributed = (pkg.contributes?.commands ?? []).map((c) => c.command).sort();

    // The entry point the manifest declares, as a rendered source file.
    const main = (pkg.main ?? "").replace(/^\.\//, "");
    const entry = [
      "src/extension.ts",
      main.replace(/^dist\//, "src/").replace(/\.js$/, ".ts"),
    ].find((candidate) => byPath.has(candidate));

    const registered = [];
    const configReads = [];
    let error = null;
    if (entry) {
      // An extension greets its own log on activation. That is the scaffolded
      // project talking, not this gate.
      const say = console.log;
      console.log = () => {};
      try {
        const module = loadRendered(entry, byPath, registered, configReads);
        if (typeof module.activate !== "function") error = `${entry} exports no activate()`;
        // The editor awaits `activate` before it treats the extension as
        // active, so a command registered after an await is live for a user.
        // Comparing before that settles would call a healthy build broken.
        else
          await module.activate({
            subscriptions: [],
            extensionUri: { fsPath: "/ext" },
            secrets: {},
          });
      } catch (cause) {
        error = `${entry} threw while activating: ${cause.message}`;
      } finally {
        console.log = say;
      }
    } else {
      error = "no rendered entry point found";
    }

    const declaredSettings = Object.keys(pkg.contributes?.configuration?.properties ?? {}).sort();
    const readSettings = new Set();
    for (const [path, content] of byPath) {
      if (!SOURCE_FILE.test(path)) continue;
      if (TEST_FILE.test(path)) continue;
      for (const key of configurationKeysRead(content, path)) readSettings.add(key);
    }

    builds.push({
      flags,
      contributed,
      registered: [...new Set(registered)].sort(),
      declaredSettings,
      readSettings: [...readSettings].sort(),
      configReads: [...new Set(configReads)].sort(),
      error,
    });
  }

  return builds;
}

function describe(flags) {
  const entries = Object.entries(flags);
  return entries.length === 0 ? "the only build" : entries.map(([k, v]) => `${k}=${v}`).join(" ");
}

async function main() {
  const templates = templatesContributingCommands();

  if (templates.length === 0) {
    console.error(
      "check-command-registration: no skeleton contributes any command. Either the " +
        "catalog ships no editor extension, or `contributes.commands` has moved and " +
        "this gate now checks nothing.",
    );
    process.exit(1);
  }

  const failures = [];
  let builds = 0;

  for (const template of templates) {
    for (const build of await registrationsPerBuild(template)) {
      builds += 1;
      const missing = build.contributed.filter((c) => !build.registered.includes(c));
      const extra = build.registered.filter((c) => !build.contributed.includes(c));
      const unread = build.declaredSettings.filter((k) => !build.readSettings.includes(k));
      const undeclared = build.readSettings.filter((k) => !build.declaredSettings.includes(k));
      const ok =
        !build.error &&
        missing.length === 0 &&
        extra.length === 0 &&
        unread.length === 0 &&
        undeclared.length === 0;
      console.log(`  ${ok ? "paired " : "BROKEN "}  ${template}  ${describe(build.flags)}`);
      if (build.error) failures.push(`${template} (${describe(build.flags)}): ${build.error}`);
      for (const key of unread) {
        failures.push(
          `${template} (${describe(build.flags)}): declares the setting "${key}" and no source in ` +
            "this build reads it, so the settings UI offers a control that changes nothing.",
        );
      }
      for (const key of undeclared) {
        failures.push(
          `${template} (${describe(build.flags)}): reads the setting "${key}", which the manifest ` +
            "does not declare, so it never appears in the settings UI and is stuck at its default.",
        );
      }
      for (const command of missing) {
        failures.push(
          `${template} (${describe(build.flags)}): contributes "${command}" and registers nothing for it, ` +
            "so the Command Palette offers an entry that fails when it is chosen.",
        );
      }
      for (const command of extra) {
        failures.push(
          `${template} (${describe(build.flags)}): registers "${command}", which nothing contributes, ` +
            "so the handler cannot be reached.",
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error("");
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }

  console.log(
    `\ncheck-manifest-declarations: ${builds} rendered build(s) across ${templates.length} ` +
      "template(s). In each, the commands the manifest contributes are exactly the commands " +
      "`activate` registers, observed by calling it; and the settings it declares are exactly " +
      "the settings the build's sources read.\n" +
      "\n" +
      "The command half is observed, the settings half is read. A key reached by a computed " +
      "name — a variable, a template literal, a lookup — is not seen here, because a source " +
      "read cannot resolve one. Observing it would mean driving each command handler far " +
      "enough to reach its configuration, which needs a model turn.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
