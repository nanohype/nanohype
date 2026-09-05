#!/usr/bin/env node
//
// check-coverage-exclusions.mjs — fail if a skeleton's coverage exclusions
// rest on a claim the skeleton does not keep.
//
// A coverage exclusion removes a file from the denominator, so the floor is
// met by a smaller surface than the one that ships. That is legitimate for a
// barrel, a type-only module, or an adapter that cannot run without a live
// SDK. It is a comment, not a check, that separates those from a file nobody
// got round to testing.
//
//   1. A security- or compliance-critical file removed from the denominator.
//      standards/testing-rubric.json's `security-critical-100` rule requires
//      those files to carry a per-file 100% override *above* the global floor,
//      and an excluded file is measured by nothing at all. A threshold on one
//      does not save it: vitest drops the file before a threshold applies.
//
//   2. An exclusion matching no file in the skeleton. It removes nothing, and
//      it reads to the next author as a decision someone made about a file. A
//      rename leaves one behind with nothing to say so.
//
//   3. An exclusion this gate cannot read, because the entry is not a literal
//      string. It goes on excluding files the check never sees.
//
// Every check here runs against the files an exclusion actually removes,
// resolved by matching each pattern against the skeleton's real tree. Deciding
// on the spelling instead would make the same file pass as `src/**/auth.ts`
// and fail as `src/auth.ts`, which is a gate one character wide to undo.
//
// The other claim an exclusion makes — that some named suite covers what it
// removes — is not here. Whether a suite covers a file is a fact about what
// runs, and no reading of either file settles it, so `check-cited-suites.mjs`
// runs the suite instead. The two share this gate's corpus through
// `lib/skeletons.mjs` so they cannot come to different views of it.
//
// The rule's id, severity and the percentage it names are read from
// standards/testing-rubric.json rather than restated, so retiring the rule or
// moving its bar moves this gate with it.
//
// What this does NOT check: that a security-critical file which is *inside*
// the denominator carries the per-file override the rule also requires. That
// is a second half of the same rule, and the catalog does not meet it yet;
// enforcing it here would fail the gate on files this check has no fix for.
//
// Usage: node scripts/check-coverage-exclusions.mjs [root]

import { readFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import _ts from "typescript";
import { excludeEntries, pathTerms, TEST_FILE } from "./lib/exclusions.mjs";
import {
  SKIP_DIRS,
  skeletonConfigs,
  skeletonFiles,
  unaccountedSkeletons,
} from "./lib/skeletons.mjs";

// TypeScript ships CommonJS; the ESM shim exposes the API as the default.
const ts = _ts.default ?? _ts;

const root = resolve(process.argv[2] ?? ".");

/**
 * The rule this gate enforces, and the bar it names, read from the standard.
 *
 * Called by the command rather than at module scope. The predicates below are
 * imported by `check-cited-suites.mjs` for its own use, and a module that reads
 * a file to be imported makes importing it a side effect — it would fail on a
 * tree with no standard, for a check that never consults one.
 */
function securityRuleOf(from) {
  const rubric = JSON.parse(readFileSync(resolve(from, "standards/testing-rubric.json"), "utf-8"));
  const rule = rubric.content.rules.find((r) => r.id === "security-critical-100");
  if (!rule) {
    console.error(
      "check-coverage-exclusions: standards/testing-rubric.json declares no " +
        "`security-critical-100` rule. This gate enforces that rule and has nothing " +
        "to enforce without it.",
    );
    process.exit(2);
  }

  // The bar the rule names, taken from the rule's own text so the two cannot
  // drift. "a per-file 100% branch/line/function override above the global
  // floor" is the sentence; 100 is the number this reads out of it.
  const bar = Number((rule.summary.match(/(\d{1,3})\s*%/) ?? [])[1]);
  if (!Number.isFinite(bar)) {
    console.error(
      "check-coverage-exclusions: `security-critical-100` names no percentage in its " +
        "summary, so the bar it requires cannot be read from the standard.",
    );
    process.exit(2);
  }

  return { rule, bar };
}

/**
 * Statement kinds that emit no runtime JavaScript. A module built only from
 * these is a barrel or a type declaration: there is no branch for the rule's
 * "100% branch/line/function" to bind to.
 *
 * The list is of the inert shapes rather than the active ones, so a shape
 * nobody listed is treated as behaviour. A blocklist of active shapes decides
 * the other way, and the shapes it misses are the ones nobody thought of —
 * object-literal method shorthand among them, which is how this catalog writes
 * its provider objects and its auth callbacks.
 */
const INERT_STATEMENTS = new Set([
  ts.SyntaxKind.ImportDeclaration,
  ts.SyntaxKind.ExportDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.ModuleDeclaration,
  ts.SyntaxKind.EmptyStatement,
]);

/**
 * True when the file has something a test could exercise.
 *
 * Decided by parsing rather than by matching tokens: the question is what the
 * module's top-level statements are, and a regex over source answers a
 * different question — which spellings its author anticipated.
 * `carriesBehaviour` is pinned against every security-critical file in the
 * catalog by `__tests__/coverage-exclusions.test.mjs`, so a shape the
 * classifier gets wrong fails there rather than passing silently here.
 */
export function carriesBehaviour(source, fileName = "file.ts") {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  for (const statement of parsed.statements) {
    if (INERT_STATEMENTS.has(statement.kind)) continue;

    // A declaration marked `declare` describes something that exists
    // elsewhere and emits nothing.
    const modifiers = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : [];
    if (modifiers.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) continue;

    // `export type { … }` and `import type { … }` parse as declarations whose
    // type-only flag is the whole point.
    if (statement.isTypeOnly) continue;

    return true;
  }

  return false;
}

// The rule names its own concerns in prose — "auth, audit ledgers, approval
// gates, secret handling, signature verification". A path can say a file is
// one of those, and often does, but a path is a name someone chose: renaming a
// verifier out of a directory called `signatures` does not stop it verifying
// signatures. So the path is one signal and the source is the other, and a
// file matching either is on the path the rule names.
//
// Each of the rule's words appears here in the forms a directory or a filename
// is written in. A matcher holding only the singular followed by a separator
// reads `audit/` and `approval/` and lets `auditing/` and `approvals/` past,
// which is a gate anyone closes by pluralising a directory name.
//
// The forms are enumerated rather than produced by a suffix rule, because
// `auth` admits no suffix rule: one that reaches `authorization` reaches
// `author` with it, and an author is not a credential. Enumeration is a list,
// so it is answerable to the tree rather than to its writer —
// `__tests__/coverage-exclusions.test.mjs` puts every security-critical
// directory the catalog ships through it, and plants the derived forms it does
// not ship yet.
const SECURITY_CRITICAL_TERMS = new Set([
  "auth",
  "auths",
  "authn",
  "authz",
  "authenticate",
  "authenticated",
  "authentication",
  "authenticator",
  "authenticators",
  "authorize",
  "authorized",
  "authorization",
  "authorizer",
  "authorizers",
  "audit",
  "audits",
  "audited",
  "auditing",
  "auditor",
  "auditors",
  "ledger",
  "ledgers",
  "approval",
  "approvals",
  "approve",
  "approved",
  "approver",
  "approvers",
  "secret",
  "secrets",
  "credential",
  "credentials",
  "password",
  "passwords",
  "apikey",
  "apikeys",
  "api-key",
  "api-keys",
  "signature",
  "signatures",
  "sign",
  "signed",
  "signing",
  "signer",
  "signers",
  "verify",
  "verified",
  "verifier",
  "verifiers",
  "verification",
  "hmac",
]);

function namedSecurityCritical(relPath) {
  for (const term of pathTerms(relPath)) {
    if (SECURITY_CRITICAL_TERMS.has(term)) return true;
  }
  return false;
}

/**
 * The cryptographic calls that authenticate rather than merely digest.
 *
 * Each takes a key or a secret as an argument, which is what makes it an
 * authentication step: `createHmac` and `createSign` produce a value only the
 * secret-holder can produce, `createVerify` checks one, `timingSafeEqual`
 * compares credentials, and the key-derivation calls turn a secret into one.
 *
 * A bare digest is not on this list. `createHash` is what a chunk id, a cache
 * key and an idempotency key are built from, and the catalog builds all three
 * with it.
 */
const KEYED_CRYPTOGRAPHY = new Set([
  "createHmac",
  "createSign",
  "createVerify",
  "timingSafeEqual",
  "createCipheriv",
  "createDecipheriv",
  "scrypt",
  "scryptSync",
  "pbkdf2",
  "pbkdf2Sync",
  "hkdf",
  "hkdfSync",
]);

/** The WebCrypto operations that take a key. */
const KEYED_SUBTLE = new Set(["sign", "verify", "importKey", "deriveKey", "deriveBits"]);

/**
 * True when the file itself calls a keyed cryptographic primitive.
 *
 * Read from the parse, so a call inside a comment or a string does not count.
 * There is no list of credential spellings here: the primitive is the whole
 * signal, and a file cannot stop matching by renaming a parameter, a variable
 * or itself — only by not calling it.
 */
export function callsKeyedCryptography(source, fileName = "file.ts") {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // A primitive imported under another name is the same primitive, so the
  // binding is followed to what it was imported as rather than matched at the
  // call site. `import { createHmac as h }` is the same call as `createHmac`.
  const localNames = new Set(KEYED_CRYPTOGRAPHY);
  const collectAliases = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /^(node:)?crypto$/.test(node.moduleSpecifier.text) &&
      node.importClause &&
      !node.importClause.isTypeOnly
    ) {
      const bindings = node.importClause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const original = (element.propertyName ?? element.name).text;
          if (KEYED_CRYPTOGRAPHY.has(original)) localNames.add(element.name.text);
        }
      }
    }
    ts.forEachChild(node, collectAliases);
  };
  collectAliases(parsed);

  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && localNames.has(callee.text)) found = true;
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
        if (KEYED_CRYPTOGRAPHY.has(callee.name.text)) found = true;
        if (
          KEYED_SUBTLE.has(callee.name.text) &&
          /subtle$/.test(callee.expression.getText(parsed))
        ) {
          found = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

/**
 * Third-party entry points whose contract is to establish or check that a
 * message is authentic. A file that calls one has made the authentication
 * decision, even though the primitive runs in a package rather than here.
 *
 * Sending with a credential is not on this list. A messaging client holds a
 * secret and computes nothing the caller decides, so it is not authenticating
 * anything — the caller cannot get it subtly wrong.
 *
 * This is a list of names, and unlike a list of credential spellings it is not
 * in the defender's gift: a parameter can be renamed, and
 * `stripe.webhooks.constructEvent` cannot. A file stops matching only by not
 * verifying with that package. What is left over — a package nobody listed —
 * is pinned by `__tests__/coverage-exclusions.test.mjs`, which enumerates the
 * third-party modules excluded files import, so a new one fails there rather
 * than passing here.
 */
const DELEGATED_AUTHENTICATION = new Map([
  ["stripe", { named: [], members: ["webhooks.constructEvent", "webhooks.constructEventAsync"] }],
  [
    "jose",
    {
      named: [
        "jwtVerify",
        "jwtDecrypt",
        "compactVerify",
        "flattenedVerify",
        "generalVerify",
        "createRemoteJWKSet",
      ],
      members: [],
    },
  ],
  ["jsonwebtoken", { named: ["verify", "sign"], members: [] }],
  ["@clerk/backend", { named: ["verifyToken"], members: [] }],
  ["@aws-sdk/s3-request-presigner", { named: ["getSignedUrl"], members: [] }],
  ["@aws-sdk/cloudfront-signer", { named: ["getSignedUrl", "getSignedCookies"], members: [] }],
  ["svix", { named: [], members: ["webhook.verify"] }],
  ["@octokit/webhooks", { named: [], members: ["webhooks.verify", "webhooks.verifyAndReceive"] }],
]);

/**
 * True when the file hands a credential to one of those entry points.
 *
 * The named arm follows the import binding, so an alias is the same call. The
 * member arm matches a dotted callee, and requires the package to be imported
 * in the same file — a receiver built by `new Stripe(...)` carries no binding
 * to follow, and without that requirement an unrelated `foo.webhooks.verify`
 * would match.
 */
export function delegatesAuthentication(source, fileName = "file.ts") {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const specifiers = new Set();
  /** Local name → the entry point it was imported as. */
  const entryPoints = new Map();
  const aliases = new Map();
  const calls = [];

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      specifiers.add(specifier);
      const known = DELEGATED_AUTHENTICATION.get(specifier);
      const clause = node.importClause;
      if (known && clause && !clause.isTypeOnly) {
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            const original = (element.propertyName ?? element.name).text;
            if (known.named.includes(original)) entryPoints.set(element.name.text, original);
          }
        }
        // A namespace import puts every export behind one name.
        if (bindings && ts.isNamespaceImport(bindings)) {
          for (const name of known.named) entryPoints.set(`${bindings.name.text}.${name}`, name);
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.add(node.arguments[0].text);
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer)
    ) {
      aliases.set(node.name.text, node.initializer.text);
    }

    if (ts.isCallExpression(node)) calls.push(node.expression.getText(parsed));

    ts.forEachChild(node, visit);
  };
  visit(parsed);

  for (const callee of calls) {
    const root = callee.split(".")[0];
    if (entryPoints.has(callee) || entryPoints.has(root)) return true;
    const aliased = aliases.get(root);
    if (aliased && entryPoints.has(aliased)) return true;

    for (const [specifier, known] of DELEGATED_AUTHENTICATION) {
      if (!specifiers.has(specifier)) continue;
      if (known.members.some((member) => callee === member || callee.endsWith(`.${member}`))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * What a file imports and where it names those imports.
 *
 * A use is any mention in a value position, not a call. `signImgixPath` put
 * into an object and reached as `SIGNERS.imgix(...)` is the same delegation
 * written the way this catalog's own registry convention asks for it, and an
 * edge that required call position would lose it — which is an evasion that
 * reads as compliance.
 */
function importsAndUses(source, fileName) {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  /** Local name → the module it was imported from. */
  const imported = new Map();
  /** Every identifier named somewhere a value is expected. */
  const used = new Set();

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        const clause = node.importClause;
        if (clause && !clause.isTypeOnly) {
          if (clause.name) imported.set(clause.name.text, specifier);
          const bindings = clause.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) {
            for (const element of bindings.elements) {
              if (!element.isTypeOnly) imported.set(element.name.text, specifier);
            }
          }
          if (bindings && ts.isNamespaceImport(bindings))
            imported.set(bindings.name.text, specifier);
        }
      }
      // The specifiers inside the clause are the declaration, not a use.
      return;
    }

    // A name inside a type says the module was consulted for its shape, which
    // is not reaching what it does.
    if (ts.isTypeNode(node) || ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) return;

    // A property NAME is not a reference to a binding: `{ sign: 1 }` does not
    // name the imported `sign`. Its initializer is visited below.
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      visit(node.initializer);
      return;
    }
    if (ts.isPropertyAccessExpression(node)) {
      visit(node.expression);
      return;
    }

    if (ts.isIdentifier(node)) used.add(node.text);

    ts.forEachChild(node, visit);
  };
  visit(parsed);

  return { imported, used };
}

const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/** Resolve a relative specifier against the files a skeleton ships. */
function resolveWithinSkeleton(specifier, fromPath, files) {
  if (!specifier.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  const candidates = [base, base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx")];
  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
    for (const extension of MODULE_EXTENSIONS) {
      if (files.has(candidate + extension)) return candidate + extension;
      const index = posix.join(candidate, `index${extension}`);
      if (files.has(index)) return index;
    }
  }
  return null;
}

/**
 * The files in one skeleton that reach a keyed cryptographic primitive: those
 * that call one, and those that CALL a binding imported from a module that
 * does.
 *
 * Naming the import is the edge, not importing it. A barrel re-exports a
 * signer without ever mentioning it in a value position, and holding a barrel
 * to a signing file's bar would say the rule is about proximity rather than
 * about what runs. A provider that reaches the signer is different in kind: it
 * decides which string is signed, with which credential, and where the
 * signature is placed, and every one of those decisions is the
 * authentication.
 *
 * `files` maps skeleton-relative path → source.
 */
export function signingPath(files) {
  const parsed = new Map();
  const onPath = new Set();

  for (const [path, source] of files) {
    parsed.set(path, importsAndUses(source, path));
    if (callsKeyedCryptography(source, path) || delegatesAuthentication(source, path)) {
      onPath.add(path);
    }
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (const [path, { imported, used }] of parsed) {
      if (onPath.has(path)) continue;
      for (const name of used) {
        const specifier = imported.get(name);
        if (!specifier) continue;
        const target = resolveWithinSkeleton(specifier, path, files);
        if (target && onPath.has(target)) {
          onPath.add(path);
          grew = true;
          break;
        }
      }
    }
  }

  return onPath;
}

/**
 * True when the file is on a security- or compliance-critical path.
 *
 * Three signals, and a file matching any of them is on the path the rule
 * names: its location, a keyed cryptographic call in its own source, and
 * — passed in by the caller, which is the only place the whole skeleton is in
 * view — whether it calls into a module that makes one.
 */
export function isSecurityCritical(relPath, source, onSigningPath = false) {
  if (namedSecurityCritical(relPath)) return true;
  if (onSigningPath) return true;
  if (source === undefined) return false;
  return callsKeyedCryptography(source, relPath) || delegatesAuthentication(source, relPath);
}

/**
 * Compile one exclusion pattern to a regex over skeleton-relative paths.
 * The patterns in use are `*` and `**` only — no braces, negation or `?` —
 * so this covers the vocabulary rather than pretending to be a glob library.
 */
function patternToRegex(pattern) {
  let out = "";
  const parts = pattern.split("/");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const last = i === parts.length - 1;
    if (part === "**") {
      // A trailing `**` takes everything below; elsewhere it spans any number
      // of directories, including none.
      out += last ? "(?:.*)?" : "(?:[^/]+/)*";
      if (!last && parts[i + 1] === undefined) out += "";
      continue;
    }
    const seg = part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
    out += seg;
    if (!last) out += "/";
  }
  return new RegExp(`^${out}$`);
}

/** The files an exclusion actually removes from this skeleton. */
function filesMatching(pattern, files) {
  const re = patternToRegex(pattern);
  return files.filter((f) => re.test(f));
}

/** The per-file threshold entries in `coverage.thresholds`, path → bar. */
function perFileThresholds(source) {
  const block = source.match(/thresholds:\s*\{([\s\S]*)\n\s{6}\},?\n/);
  const text = block ? block[1] : source;
  const found = new Map();
  const entryRe = /["']([^"']*\.tsx?)["']\s*:\s*\{([^}]*)\}/g;
  for (const m of text.matchAll(entryRe)) {
    const bars = [...m[2].matchAll(/\b(?:lines|functions|branches|statements)\s*:\s*(\d+)/g)].map(
      (b) => Number(b[1]),
    );
    found.set(m[1], bars.length ? Math.min(...bars) : 0);
  }
  return found;
}

// Importing this module for its predicates must not run the gate.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!invokedDirectly) {
  // The predicates above are the module's export surface; everything below is
  // the command.
} else {
  const { rule: securityRule, bar: REQUIRED_BAR } = securityRuleOf(root);
  const configs = skeletonConfigs(root);

  // A gate that reports success over an empty corpus asserts nothing. The
  // catalog ships JavaScript skeletons with vitest configs, so finding none is
  // this walk breaking rather than the catalog losing them.
  if (configs.length === 0) {
    console.error(
      "check-coverage-exclusions: found no vitest config under any skeleton — the walk " +
        "matched nothing, so this gate is asserting nothing.",
    );
    process.exit(2);
  }

  // The walk is answerable to the manifests, not to itself. A package that
  // declares vitest and whose directory holds no config the walk reached is a
  // suite this gate is silent about, and silence is what the previous walk
  // sold as success.
  const unaccounted = unaccountedSkeletons(root, configs);
  if (unaccounted.length) {
    console.error(
      `check-coverage-exclusions: ${unaccounted.length} skeleton package(s) declare vitest ` +
        "and hold no config this walk reached.\n" +
        "Either the package ships a suite with no coverage configuration, or the walk does\n" +
        "not reach where the config sits. Both are this gate reporting on a smaller corpus\n" +
        "than the one that exists.\n",
    );
    for (const d of unaccounted) {
      const why = d.unreadable ? " (manifest does not parse)" : "";
      console.error(`  ${relative(root, d.dir)}${why}`);
    }
    process.exit(2);
  }

  const excludedCritical = [];
  const unresolvable = [];
  const unreadable = [];
  let checkedExclusions = 0;
  let checkedFiles = 0;

  for (const config of configs) {
    const skeleton = dirname(config);
    const source = readFileSync(config, "utf-8");
    const where = relative(root, config);

    const all = skeletonFiles(skeleton);
    const sources = all.filter((f) => /\.tsx?$/.test(f) && !TEST_FILE.test(f));
    checkedFiles += sources.length;

    const rawEntries = excludeEntries(source, config);
    for (const [index, entry] of rawEntries.entries()) {
      if (entry === null) {
        unreadable.push(
          `${where}  coverage.exclude[${index}] is not a literal string, so what it removes ` +
            "cannot be resolved and this gate cannot say whether it is honest.",
        );
      }
    }
    const entries = rawEntries.filter((entry) => entry !== null);
    checkedExclusions += entries.length;

    const pinned = perFileThresholds(source);

    // Resolve every exclusion against the tree, so the decision is about the
    // files removed rather than about how the pattern was written.
    const excluded = new Set();
    for (const entry of entries) {
      const hits = filesMatching(entry, all);
      if (hits.length === 0) {
        // An exclusion naming a directory the walk does not descend into
        // removes nothing here and removes real files in a project that has
        // built. Requiring a file the walk is not allowed to see would make
        // the entry unresolvable however it is written.
        if (!entry.split("/").some((segment) => SKIP_DIRS.has(segment))) {
          unresolvable.push(`${where}  excludes ${entry} — matches no file in the skeleton`);
        }
        continue;
      }
      for (const hit of hits) excluded.add(hit);
    }

    // Which files reach a keyed primitive is a question about the whole
    // skeleton, not about one file, so it is answered once here and the answer
    // is handed to the per-file decision below.
    const skeletonSources = new Map(
      sources.map((file) => [file, readFileSync(join(skeleton, file), "utf-8")]),
    );
    const onSigningPath = signingPath(skeletonSources);

    for (const file of sources) {
      if (!excluded.has(file)) continue;
      const source = skeletonSources.get(file);
      if (!isSecurityCritical(file, source, onSigningPath.has(file))) continue;
      if (!carriesBehaviour(source, file)) continue;
      const via = entries.find((e) => filesMatching(e, [file]).length > 0);
      const alsoPinned = pinned.has(file) ? "; its per-file threshold never applies" : "";
      const why = callsKeyedCryptography(source, file)
        ? "signs or verifies with a key"
        : delegatesAuthentication(source, file)
          ? "hands a credential to a package that authenticates with it"
          : onSigningPath.has(file)
            ? "composes what an authentication step is given"
            : "sits on a security-critical path by its location";
      excludedCritical.push(`${where}  ${file} — ${why}; removed by '${via}'${alsoPinned}`);
    }
  }

  let failed = false;

  if (unreadable.length) {
    failed = true;
    console.error(
      `check-coverage-exclusions: ${unreadable.length} coverage-exclusion entr(ies) this gate ` +
        "cannot read.\n" +
        "An exclusion has to be a literal string, because what it removes is resolved against\n" +
        "the tree. An element built at run time excludes files this check never sees.\n",
    );
    for (const line of unreadable) console.error(`  ${line}`);
  }

  if (excludedCritical.length) {
    failed = true;
    console.error(
      `\ncheck-coverage-exclusions: ${excludedCritical.length} security-critical file(s) ` +
        `removed from coverage.\n` +
        `standards/testing-rubric.json rule 'security-critical-100' (severity: ` +
        `${securityRule.severity}) requires\n` +
        `a per-file ${REQUIRED_BAR}% override above the global floor for these paths. An exclusion is the\n` +
        `inverse: the file the standard singles out ends up measured by nothing, and a\n` +
        `threshold on an excluded file never applies.\n`,
    );
    for (const e of excludedCritical) console.error(`  ${e}`);
  }

  if (unresolvable.length) {
    failed = true;
    console.error(
      `\ncheck-coverage-exclusions: ${unresolvable.length} coverage exclusion(s) match no file.\n` +
        `An exclusion that removes nothing reads to the next author as a decision that was\n` +
        `made about a file. Delete the entry, or fix the path.\n`,
    );
    for (const u of unresolvable) console.error(`  ${u}`);
  }

  if (failed) process.exit(1);

  console.log(
    `check-coverage-exclusions: ${configs.length} skeleton vitest config(s). ` +
      `${checkedExclusions} exclusion(s), read by parsing each config rather than by matching a ` +
      `quote style, resolved against ${checkedFiles} source file(s). Every exclusion removes at ` +
      `least one file, or names a directory this walk does not enter.\n` +
      `\n` +
      `Of the excluded files that carry a runtime statement, none:\n` +
      `  - calls a keyed primitive of node:crypto or WebCrypto;\n` +
      `  - calls an authentication entry point of a third-party package this gate models;\n` +
      `  - names, anywhere outside a type, a binding from a module in the same skeleton that\n` +
      `    transitively does either;\n` +
      `  - sits at a path this gate reads as security-critical.\n` +
      `\n` +
      `That is the whole claim. Four shapes reach a credential without contradicting it:\n` +
      `  - a signer reached only through a runtime registry lookup, where no binding of the\n` +
      `    signing module is named in the file at all. A reader that resolves a registry's\n` +
      `    string keys to the modules registering under them would close it.\n` +
      `  - a comparison or a digest composed by hand rather than called from a library. A\n` +
      `    reader that follows a value from a parameter the caller supplies as a secret into\n` +
      `    a digest or a comparison would close it.\n` +
      `  - a package handed its credential in a constructor or an options object and never\n` +
      `    in a call. A reader that tracks a secret into a constructed object and out through\n` +
      `    its methods would close it.\n` +
      `  - a package nobody has modelled. That one is pinned instead: the third-party modules\n` +
      `    excluded files import are enumerated in __tests__/coverage-exclusions.test.mjs, so a\n` +
      `    new one fails there until someone classifies it.\n` +
      `\n` +
      `The path arm is a reading of names, and a name is the author's to choose. It holds the\n` +
      `forms of the words the rule itself names — a directory called approvals/ as well as one\n` +
      `called approval/ — and it does not reach a file whose role the rule describes under a\n` +
      `name the rule does not use. The two arms above it decide by what a file calls, which is\n` +
      `why a name is the last signal consulted rather than the first.`,
  );
}
