import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import _ts from "typescript";
import {
  callsKeyedCryptography,
  carriesBehaviour,
  delegatesAuthentication,
  isSecurityCritical,
  signingPath,
} from "../check-coverage-exclusions.mjs";
import { citedClaims, excludeEntries, suiteFilesFor } from "../lib/exclusions.mjs";
import { skeletonConfigs, unaccountedSkeletons } from "../lib/skeletons.mjs";

// A gate deciding by pattern over source is a claim about the shapes the tree
// contains. These pin the claim: the classifier is run against every
// declaration shape the catalog actually ships, so a shape it reads wrongly
// fails here rather than passing silently in the gate.
//
// The regression this exists for: a predicate that tested for `function`, `=>`
// and `class ` returned false for object-literal method shorthand, which is
// how this catalog writes its provider objects and its auth callbacks. HMAC
// verifiers and a NextAuth authorization callback could be dropped from the
// coverage denominator with the gate reporting the opposite.

const ts = _ts.default ?? _ts;

// A dollar before a brace is a placeholder to a linter and two characters to a
// fixture, so the fixtures below spell it apart from the brace it precedes.
const D = "$";

const ROOT = new URL("../..", import.meta.url).pathname;
const TEMPLATES = join(ROOT, "templates");

// The gate's own walk, not a second one. Two discoveries agree until one is
// deepened, and the tests are the wrong half to be pinning the shallower tree.
import { skeletonFiles as walk } from "../lib/skeletons.mjs";

/** Every non-test TypeScript file the catalog ships, with its source. */
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
      if (!/\.tsx?$/.test(file) || /\.(test|spec)\.tsx?$/.test(file)) continue;
      out.push({ template: name, file, source: readFileSync(join(skeleton, file), "utf-8") });
    }
  }
  return out;
}

/** Every skeleton's non-test sources, keyed by skeleton-relative path. */
function skeletonSources(template) {
  const root = join(TEMPLATES, template, "skeleton");
  const out = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "dist", "coverage", "build"].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        const rel = relative(root, full).split("\\").join("/");
        if (!/__tests__|\.(test|spec)\./.test(rel)) out.set(rel, readFileSync(full, "utf-8"));
      }
    }
  };
  walk(join(root, "src"));
  return out;
}

describe("carriesBehaviour", () => {
  // Each of these is a shape the catalog contains. A classifier that reads any
  // of them the other way lets a file out of the denominator, or forces one in
  // that has nothing to measure.
  const SHAPES = [
    ["function declaration", "export function verify() { return true; }", true],
    ["arrow assigned to a const", "export const verify = () => true;", true],
    ["class declaration", "export class Verifier { check() { return true; } }", true],
    [
      "object-literal method shorthand",
      'export const provider = { name: "hmac", verify(body, sig) { return body === sig; } };',
      true,
    ],
    [
      "async object-literal method shorthand",
      "export const provider = { async send(m) { return m; } };",
      true,
    ],
    [
      "callback as method shorthand inside a nested object",
      "export const config = { callbacks: { authorized({ auth }) { return !!auth?.user; } } };",
      true,
    ],
    ["call expression at module scope", 'import { init } from "./b.js";\ninit();', true],
    [
      "destructured call result",
      'import N from "n";\nexport const { handlers, auth } = N(options);',
      true,
    ],
    ["a const holding data", "export const LIMITS = { max: 10 };", true],
    ["pure re-export barrel", 'export { a } from "./a.js";\nexport * from "./b.js";', false],
    ["type-only module", "export interface A { x: string }\nexport type B = A | null;", false],
    ["type-only re-export", 'export type { A } from "./a.js";', false],
    // A bare side-effect import runs code, but none of it belongs to this
    // file, so there is nothing here for a per-file threshold to measure.
    ["a side-effect import alone", 'import "./register.js";', false],
    ["ambient declaration", "declare function f(): void;", false],
    ["empty file", "", false],
    ["comments only", "// nothing here\n/* still nothing */", false],
  ];

  for (const [name, source, expected] of SHAPES) {
    it(`reads ${name} as ${expected ? "behaviour" : "inert"}`, () => {
      assert.equal(carriesBehaviour(source, "sample.ts"), expected);
    });
  }

  it("reads every file the catalog ships without throwing", () => {
    // A parse failure would make the classifier fall over on a shape rather
    // than misread it, which is the other way this can go wrong.
    const sources = catalogSources();
    assert.ok(sources.length > 0, "found no catalog sources — the walk is broken");
    for (const { template, file, source } of sources) {
      assert.doesNotThrow(
        () => carriesBehaviour(source, file),
        `${template}/${file} could not be classified`,
      );
    }
  });

  it("agrees with a statement-level read of every file the catalog ships", () => {
    // Derived from the tree rather than sampled. For each catalog file, the
    // top-level statements are read independently of the classifier and
    // reduced to the same question: is any of them outside the inert set. A
    // file the two answer differently is a shape the classifier reads wrongly.
    const disagreements = [];
    for (const { template, file, source } of catalogSources()) {
      const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        false,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const independent = parsed.statements.some((statement) => {
        const inert =
          statement.kind === ts.SyntaxKind.ImportDeclaration ||
          statement.kind === ts.SyntaxKind.ExportDeclaration ||
          statement.kind === ts.SyntaxKind.InterfaceDeclaration ||
          statement.kind === ts.SyntaxKind.TypeAliasDeclaration ||
          statement.kind === ts.SyntaxKind.ModuleDeclaration ||
          statement.kind === ts.SyntaxKind.EmptyStatement;
        if (inert) return false;
        const modifiers = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : [];
        if (modifiers.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) return false;
        return statement.isTypeOnly !== true;
      });

      if (carriesBehaviour(source, file) !== independent) {
        disagreements.push(`${template}/${file}: classifier says ${!independent}`);
      }
    }
    assert.deepEqual(disagreements, []);
  });
});

describe("isSecurityCritical", () => {
  // Two signals, and the second is what stops a rename hiding a verifier.
  //
  // By location: the rule names its concerns in prose — "auth, audit ledgers,
  // approval gates, secret handling, signature verification" — and a path
  // often says a file is one of them.
  const BY_PATH = [
    "src/auth/middleware.ts",
    "src/lib/auth/options.ts",
    "src/api/middleware/auth.ts",
    "src/tenant/auth.ts",
    "src/audit/index.ts",
    "src/audit/providers/dynamodb.ts",
    "src/webhook/signatures/hmac-sha256.ts",
    "src/auth/providers/apikey.ts",
  ];
  for (const path of BY_PATH) {
    it(`matches ${path} by its location`, () => assert.equal(isSecurityCritical(path), true));
  }

  const UNNAMED = ["src/logger.ts", "src/pipeline/transform/semantic.ts", "src/tokens.ts"];
  for (const path of UNNAMED) {
    it(`does not match ${path} by its location`, () =>
      assert.equal(isSecurityCritical(path), false));
  }

  // By what the file does. A path is a name someone chose; these are the
  // shapes the catalog actually contains, and each is matched from a path
  // that says nothing.
  const BY_SOURCE = [
    [
      "keyed HMAC over a secret",
      'import { createHmac } from "node:crypto";\nexport const sign = (b, k) => createHmac("sha1", k).update(b).digest("hex");',
    ],
    [
      "constant-time credential comparison",
      'import { timingSafeEqual } from "node:crypto";\nexport const ok = (a, b) => timingSafeEqual(a, b);',
    ],
    [
      "signing method shorthand on a provider object",
      'import { createHmac } from "node:crypto";\nexport const provider = { sign(body, secret) { return createHmac("sha256", secret).update(body).digest("hex"); } };',
    ],
  ];
  for (const [name, source] of BY_SOURCE) {
    it(`matches ${name} from a path that says nothing`, () =>
      assert.equal(isSecurityCritical("src/providers/provider-a.ts", source), true));
  }

  // An unkeyed digest is not matched, whatever it is taken over. `createHash`
  // is what the catalog builds a chunk id, a cache key and an idempotency key
  // from, and telling those apart from a digest over a secret means following
  // where the hashed value came from. Reading the names of the variables
  // instead is what a rename walks through, so the digest is left to the
  // enumeration below rather than guessed at here.
  const NOT_BY_SOURCE = [
    [
      "a digest with no secret in sight",
      'import { createHash } from "node:crypto";\nexport const key = (u) => createHash("sha1").update(u).digest("hex");',
    ],
    [
      "a digest taken over secret material",
      'import { createHash } from "node:crypto";\nexport function sign(params, apiSecret) {\n  return createHash("sha256").update(params + apiSecret).digest("hex");\n}',
    ],
    ["prose mentioning a secret", "// Do not log the secret.\nexport const f = () => 1;"],
    ["a string mentioning hmac", 'export const label = "hmac";'],
  ];
  for (const [name, source] of NOT_BY_SOURCE) {
    it(`does not match ${name}`, () =>
      assert.equal(isSecurityCritical("src/util/cache-key.ts", source), false));
  }

  it("still matches a verifier renamed out of a directory that named it", () => {
    // The regression: moving hmac-sha256.ts to providers/provider-a.ts left it
    // doing exactly what it did before while the classifier stopped seeing it.
    const source = readFileSync(
      join(
        TEMPLATES,
        "module-webhook-ts",
        "skeleton",
        "src",
        "webhook",
        "signatures",
        "hmac-sha256.ts",
      ),
      "utf-8",
    );

    assert.equal(isSecurityCritical("src/webhook/providers/provider-a.ts", source), true);
  });

  it("is not satisfied by a rename", () => {
    // The regression this exists for: classification once turned on whether an
    // identifier matched a list of credential spellings, so renaming the
    // parameter put a shipped signer back outside the rule. The primitive is
    // the signal now, so every name here is deliberately uninformative.
    const source =
      'import { createHmac as h } from "node:crypto";\n' +
      'export const f = (a, b) => h("sha256", b).update(a).digest("hex");';

    assert.equal(callsKeyedCryptography(source, "src/util/x.ts"), true);
    assert.equal(isSecurityCritical("src/util/x.ts", source), true);
  });
});

describe("signingPath", () => {
  // Calling is the edge, not importing. A barrel hands a signer on without
  // composing anything; a provider that calls it decides which string is
  // signed, with which secret, and where the result goes.
  const SIGNER =
    'import { createHmac } from "node:crypto";\nexport const sign = (b, k) => createHmac("sha256", k).update(b).digest("hex");';

  it("includes the module that calls a keyed primitive", () => {
    const files = new Map([["src/sign.ts", SIGNER]]);
    assert.deepEqual([...signingPath(files)], ["src/sign.ts"]);
  });

  it("includes a module that calls the signer it imported", () => {
    const files = new Map([
      ["src/sign.ts", SIGNER],
      [
        "src/provider.ts",
        `import { sign } from "./sign.js";\nexport const url = (p, k) => \u0060${D}{p}?s=${D}{sign(p, k)}\u0060;`,
      ],
    ]);
    assert.deepEqual([...signingPath(files)].sort(), ["src/provider.ts", "src/sign.ts"]);
  });

  it("includes a module that calls the signer through a local alias", () => {
    // `const signUrl = signImgixPath` — the call site names the alias.
    const files = new Map([
      ["src/sign.ts", SIGNER],
      [
        "src/provider.ts",
        'import { sign } from "./sign.js";\nconst signUrl = sign;\nexport const url = (p, k) => signUrl(p, k);',
      ],
    ]);
    assert.ok(signingPath(files).has("src/provider.ts"));
  });

  it("excludes a barrel that only re-exports the signer", () => {
    const files = new Map([
      ["src/sign.ts", SIGNER],
      ["src/index.ts", 'export { sign } from "./sign.js";'],
    ]);
    assert.deepEqual([...signingPath(files)], ["src/sign.ts"]);
  });

  it("excludes a module that imports the signer and never calls it", () => {
    const files = new Map([
      ["src/sign.ts", SIGNER],
      ["src/types.ts", 'import { sign } from "./sign.js";\nexport type Signer = typeof sign;'],
    ]);
    assert.deepEqual([...signingPath(files)], ["src/sign.ts"]);
  });

  it("reaches through a chain of callers", () => {
    const files = new Map([
      ["src/sign.ts", SIGNER],
      ["src/mid.ts", 'import { sign } from "./sign.js";\nexport const m = (a, b) => sign(a, b);'],
      ["src/top.ts", 'import { m } from "./mid.js";\nexport const t = (a, b) => m(a, b);'],
    ]);
    assert.deepEqual([...signingPath(files)].sort(), ["src/mid.ts", "src/sign.ts", "src/top.ts"]);
  });
});

/** The paths the gate reads as security-critical, mirrored from the gate. */
const SECURITY_CRITICAL_BY_PATH =
  /(^|\/)auth(\/|\.|-)|(^|\/)authz?\.tsx?$|(^|\/)audit(\/|\.|-)|(^|\/)ledger(\/|\.|-)|(^|\/)(api-?key|credential|secret|password)|(^|\/)(hmac|signature|signing|verifier)|(^|\/)approval(\/|\.|-)/i;

describe("the signing surfaces the catalog ships", () => {
  // Enumerated from the tree, not from the classifier's own answer. A skeleton
  // that grows a signing file and is not listed here fails, and so does a
  // classifier that stops seeing one of these. The comparison the old version
  // of this test made -- collect files where the operation reader says yes and
  // the classifier says no -- could not fail, because the classifier's answer
  // was a disjunction containing the operation reader.
  const EXPECTED = {
    "api-gateway": ["src/gateway/index.ts", "src/gateway/middleware/auth.ts"],
    "module-auth-ts": [
      "src/auth/providers/auth0.ts",
      "src/auth/providers/clerk.ts",
      "src/auth/providers/jwt.ts",
    ],
    "module-billing-ts": ["src/billing/providers/stripe.ts"],
    "module-media-ts": [
      "src/media/providers/cloudinary.ts",
      "src/media/providers/imgix.ts",
      "src/media/providers/signatures.ts",
      "src/media/providers/uploadcare.ts",
    ],
    "module-oauth-delegation-ts": [
      "src/oauth/handlers/callback.ts",
      "src/oauth/handlers/start.ts",
      "src/oauth/router.ts",
      "src/oauth/state.ts",
    ],
    "module-storage-ts": ["src/storage/providers/r2.ts", "src/storage/providers/s3.ts"],
    "module-webhook-ts": [
      "src/webhook/signatures/hmac-sha1.ts",
      "src/webhook/signatures/hmac-sha256.ts",
    ],
  };

  /** template → the files the classifier puts on the signing path. */
  function found() {
    const out = {};
    for (const template of readdirSync(TEMPLATES).sort()) {
      let sources;
      try {
        sources = skeletonSources(template);
      } catch {
        continue;
      }
      const path = [...signingPath(sources)].sort();
      if (path.length) out[template] = path;
    }
    return out;
  }

  it("is exactly the set enumerated here", () => {
    assert.deepEqual(found(), EXPECTED);
  });

  it("classifies every one of them security-critical, and nothing else", () => {
    // The `onSigningPath` argument is passed as computed, not as a literal.
    // `isSecurityCritical` returns true whenever that argument is true, so
    // handing it `true` would assert nothing for any tree — the same shape as
    // the tautology this replaced, at a new address.
    const wrong = [];
    for (const template of readdirSync(TEMPLATES).sort()) {
      let sources;
      try {
        sources = skeletonSources(template);
      } catch {
        continue;
      }
      const path = signingPath(sources);
      for (const [file, source] of sources) {
        const classified = isSecurityCritical(file, source, path.has(file));
        const expected =
          path.has(file) ||
          callsKeyedCryptography(source, file) ||
          SECURITY_CRITICAL_BY_PATH.test(file);
        if (classified !== expected) {
          wrong.push(`${template}/${file}: classified ${classified}, expected ${expected}`);
        }
      }
    }
    assert.deepEqual(wrong, []);
  });

  it("does not classify a file that reaches nothing", () => {
    // The negative half. Without it a classifier that answered yes to
    // everything would satisfy every assertion above.
    const sources = skeletonSources("module-media-ts");
    const path = signingPath(sources);
    const ordinary = [...sources.keys()].filter(
      (file) => !path.has(file) && !SECURITY_CRITICAL_BY_PATH.test(file),
    );

    assert.ok(ordinary.length > 0, "no ordinary file in this skeleton to prove against");
    for (const file of ordinary) {
      assert.equal(
        isSecurityCritical(file, sources.get(file), false),
        false,
        `${file} is classified security-critical and reaches no credential`,
      );
    }
  });

  it("holds a file that only composes what the signer is given", () => {
    // Without one, "reaches a keyed primitive" would be indistinguishable from
    // "calls a keyed primitive", and the three media providers -- which
    // delegate the primitive to a sibling module -- are exactly that shape.
    const sources = skeletonSources("module-media-ts");
    const composes = [...signingPath(sources)].filter(
      (f) => !callsKeyedCryptography(sources.get(f), f),
    );
    assert.ok(composes.length > 0, "no delegating signer in the catalog to prove against");
  });
});

describe("citedClaims", () => {
  // A justification is a sentence about particular entries. Which entries is
  // the whole question: a check that scans every comment in a config against
  // every filename in a skeleton passes a config that excludes nothing.
  const config = (body) =>
    `import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { coverage: {\n${body}\n} } });`;

  it("attributes a comment above `exclude:` to the entries no inner comment claims", () => {
    const claims = citedClaims(
      config('// covered by the integration suite\nexclude: ["a.ts", "b.ts"],'),
    );
    assert.equal(claims.length, 1);
    assert.equal(claims[0].word, "integration");
    assert.deepEqual(claims[0].entries, ["a.ts", "b.ts"]);
  });

  it("attributes a leading comment to the run it heads, not to one entry", () => {
    // A rationale written above a group is about the group. Attributing it to
    // the next entry alone would leave the rest of its group unclaimed and let
    // a false sentence stand over them.
    const claims = citedClaims(
      config('exclude: [\n"a.ts",\n// the integration suite covers these\n"b.ts",\n"c.ts",\n],'),
    );
    assert.deepEqual(claims[0].entries, ["b.ts", "c.ts"]);
  });

  it("ends a run at the next leading comment", () => {
    const claims = citedClaims(
      config(
        'exclude: [\n// the integration suite covers these\n"a.ts",\n// and these need a live SDK\n"b.ts",\n],',
      ),
    );
    assert.equal(claims.length, 1);
    assert.deepEqual(claims[0].entries, ["a.ts"]);
  });

  it("attributes a trailing comment to the entry it trails", () => {
    const claims = citedClaims(
      config('exclude: [\n"a.ts", // the e2e suite covers this\n"b.ts",\n],'),
    );
    assert.deepEqual(claims[0].entries, ["a.ts"]);
  });

  it("joins a rationale written as consecutive line comments", () => {
    // Three `//` lines are one paragraph to a reader and three comments to a
    // scanner. Read separately, the entries below belong to the first line and
    // a claim made on the third argues for nothing.
    const claims = citedClaims(
      config(
        '// Gate the pure logic.\n// The rest is covered by\n// the integration suite.\nexclude: ["a.ts"],',
      ),
    );
    assert.equal(claims.length, 1);
    assert.deepEqual(claims[0].entries, ["a.ts"]);
  });

  it("reports no claim for a config that excludes nothing", () => {
    // The check that shipped failed this one on the comment alone. There is no
    // entry for the sentence to be about.
    assert.deepEqual(citedClaims(config("// covered by the integration suite")), []);
    assert.deepEqual(citedClaims(config("// covered by the integration suite\nexclude: [],")), []);
  });

  it("reports no claim for a comment outside the exclusion", () => {
    assert.deepEqual(
      citedClaims(
        `// this project keeps its integration suite in another package\n${config('exclude: ["a.ts"],')}`,
      ),
      [],
    );
  });

  it("reads the claim out of every comment shape", () => {
    const words = (body) => citedClaims(config(body)).map((c) => c.word);
    assert.deepEqual(words('/* covered by the integration suite */\nexclude: ["a.ts"],'), [
      "integration",
    ]);
    assert.deepEqual(words('/**\n * covered by the e2e suite\n */\nexclude: ["a.ts"],'), ["e2e"]);
  });

  it("does not read a suite word out of a string", () => {
    // `**/*.e2e.ts` names a file pattern. A glob is not an argument that a
    // suite exists, and a gate that read one would fail a config for saying
    // where its tests live.
    assert.deepEqual(citedClaims(config('exclude: ["src/**/*.e2e.ts"],')), []);
  });

  it("tracks each cited suite separately", () => {
    // An e2e claim is not discharged by a smoke test.
    const claims = citedClaims(
      config('// the e2e and smoke suites cover this\nexclude: ["a.ts"],'),
    );
    assert.deepEqual(
      claims.map((c) => c.word),
      ["e2e", "smoke"],
    );
  });

  it("reports the line the claim sits on", () => {
    const [claim] = citedClaims(config('\n\n// see the smoke suite\nexclude: ["a.ts"],'));
    assert.equal(claim.word, "smoke");
    assert.equal(typeof claim.line, "number");
  });
});

describe("suiteFilesFor", () => {
  // The check that shipped matched the cited word against a basename, so a
  // suite living in an `integration/` directory was invisible and its author
  // was told to write the file already sitting there.
  const files = [
    "src/__tests__/integration/queue.test.ts",
    "src/__tests__/pipeline.integration.test.ts",
    "src/__tests__/unit.test.ts",
    "src/e2e/checkout.spec.ts",
    "src/__tests__/end-to-end.test.ts",
    "src/integration-notes.md",
  ];

  it("finds a suite named by its directory", () => {
    assert.ok(
      suiteFilesFor("integration", files).includes("src/__tests__/integration/queue.test.ts"),
    );
  });

  it("finds a suite named by an infix", () => {
    assert.ok(
      suiteFilesFor("integration", files).includes("src/__tests__/pipeline.integration.test.ts"),
    );
  });

  it("finds a hyphenated suite name", () => {
    assert.deepEqual(suiteFilesFor("end-to-end", files), ["src/__tests__/end-to-end.test.ts"]);
  });

  it("takes only test files", () => {
    // A note about the integration suite is not the integration suite.
    assert.ok(!suiteFilesFor("integration", files).includes("src/integration-notes.md"));
  });

  it("does not answer one suite's citation with another's file", () => {
    assert.deepEqual(suiteFilesFor("smoke", files), []);
  });
});

describe("delegatesAuthentication", () => {
  // A file that hands a credential to a package which checks or produces a
  // signature has made the authentication decision, even though the primitive
  // runs elsewhere. This is a list of entry points, and unlike a list of
  // credential spellings it is not in the defender's gift: a parameter can be
  // renamed and `webhooks.constructEvent` cannot.
  it("matches a webhook verifier reached on a constructed client", () => {
    const source = [
      'import Stripe from "stripe";',
      "const client = new Stripe(key);",
      "export function handle(payload, signature, secret) {",
      "  return client.webhooks.constructEvent(payload, signature, secret);",
      "}",
    ].join("\n");
    assert.equal(delegatesAuthentication(source, "src/anything.ts"), true);
  });

  it("matches a presigner imported under another name", () => {
    const source = [
      'import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";',
      "export const url = (c, cmd) => awsGetSignedUrl(c, cmd, { expiresIn: 900 });",
    ].join("\n");
    assert.equal(delegatesAuthentication(source, "src/anything.ts"), true);
  });

  it("matches a verifier reached through a namespace import", () => {
    const source = [
      'import * as jose from "jose";',
      "export const check = (t, k) => jose.jwtVerify(t, k);",
    ].join("\n");
    assert.equal(delegatesAuthentication(source, "src/anything.ts"), true);
  });

  it("does not match a member call when the package is not imported here", () => {
    // Without that requirement any `x.webhooks.constructEvent` matches, and
    // the receiver is often something else entirely.
    const source = [
      'import { thing } from "./local.js";',
      "export const go = (a, b, c) => thing.webhooks.constructEvent(a, b, c);",
    ].join("\n");
    assert.equal(delegatesAuthentication(source, "src/anything.ts"), false);
  });

  it("does not match a package that merely holds a credential", () => {
    // Sending with a secret is not authenticating: the caller decides nothing
    // that can be subtly wrong.
    const source = [
      'import twilio from "twilio";',
      "export const send = (c, to, body) => c.messages.create({ to, body });",
    ].join("\n");
    assert.equal(delegatesAuthentication(source, "src/anything.ts"), false);
  });

  it("does not match a name that only looks like an entry point", () => {
    assert.equal(
      delegatesAuthentication("export const verify = (a) => a === 1;", "src/anything.ts"),
      false,
    );
    assert.equal(
      delegatesAuthentication('export const label = "jwtVerify";', "src/anything.ts"),
      false,
    );
  });
});

describe("excludeEntries", () => {
  // A quote style is not a claim about anything. A regex over the source
  // answers which quote characters its author expected, so an entry written
  // another way keeps excluding the file while dropping out of the gate's
  // view.
  const config = (body) => `export default { test: { coverage: { exclude: [${body}] } } };`;

  it("reads an entry however it is quoted", () => {
    assert.deepEqual(excludeEntries(config("\"a.ts\", 'b.ts', `c.ts`")), ["a.ts", "b.ts", "c.ts"]);
  });

  it("reports an element it cannot read rather than dropping it", () => {
    // Dropping it would check fewer exclusions than the config has, and say
    // nothing about the difference.
    assert.deepEqual(excludeEntries(config('"a.ts", ...EXTRA')), ["a.ts", null]);
    assert.deepEqual(excludeEntries(config("`\u0024{dir}/a.ts`")), [null]);
  });

  it("reads nothing from a config with no exclude", () => {
    assert.deepEqual(excludeEntries("export default { test: {} };"), []);
  });
});

describe("the third-party surface behind the exclusions", () => {
  // The gate models a fixed set of authentication entry points, so a package
  // nobody has modelled is the residual it cannot reach. That residual is
  // pinned here rather than left silent: every third-party module an excluded
  // behaviour-carrying file imports is enumerated, so adding one fails this
  // test until somebody decides whether it authenticates.
  //
  // None of these authenticates. A package that does belongs in the gate's
  // DELEGATED_AUTHENTICATION map instead, and the file importing it then
  // cannot be excluded at all.
  const DOES_NOT_AUTHENTICATE = new Set([
    "@anthropic-ai/sdk",
    "@aws-sdk/client-bedrock-runtime",
    "@aws-sdk/client-sqs",
    "@google-cloud/vertexai",
    "@hono/node-server",
    "@huggingface/inference",
    "@libsql/client",
    "@modelcontextprotocol/sdk",
    "@opentelemetry/api",
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/exporter-metrics-otlp-http",
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/resources",
    "@opentelemetry/sdk-metrics",
    "@opentelemetry/sdk-node",
    "@opentelemetry/sdk-trace-node",
    "@opentelemetry/semantic-conventions",
    "@pinecone-database/pinecone",
    "@qdrant/js-client-rest",
    "@slack/bolt",
    "better-sqlite3",
    "bullmq",
    "chromadb",
    "cohere-ai",
    "commander",
    "crypto",
    "discord.js",
    "dotenv",
    "drizzle-orm",
    "electron",
    "express",
    "fs",
    "groq-sdk",
    "hono",
    "ioredis",
    "js-tiktoken",
    "memjs",
    // Maps a filename extension to a content type. It carries no secret and
    // decides nothing about whether a request is authentic.
    "mime-types",
    "next",
    "openai",
    "path",
    "pg",
    "postgres",
    "react",
    "react-dom",
    "simple-git",
    "url",
    "vscode",
    "yaml",
    "zod",
  ]);

  /** Every package imported by a file some skeleton excludes from coverage. */
  function importedByExcludedFiles() {
    const found = new Set();
    for (const template of readdirSync(TEMPLATES).sort()) {
      const skeleton = join(TEMPLATES, template, "skeleton");
      const configPath = join(skeleton, "vitest.config.ts");
      let entries;
      try {
        entries = excludeEntries(readFileSync(configPath, "utf-8"), configPath).filter(Boolean);
      } catch {
        continue;
      }

      let sources;
      try {
        sources = skeletonSources(template);
      } catch {
        continue;
      }

      for (const [file, source] of sources) {
        if (!entries.some((entry) => patternToRegex(entry).test(file))) continue;
        if (!carriesBehaviour(source, file)) continue;
        for (const pkg of importedPackages(source, file)) found.add(pkg);
      }
    }
    return found;
  }

  /** The same glob semantics the gate resolves exclusions with. */
  function patternToRegex(pattern) {
    let out = "";
    const parts = pattern.split("/");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const last = i === parts.length - 1;
      if (part === "**") {
        out += last ? "(?:.*)?" : "(?:[^/]+/)*";
        continue;
      }
      out += part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
      if (!last) out += "/";
    }
    return new RegExp(`^${out}$`);
  }

  /** The packages one source imports, scope included, subpath dropped. */
  function importedPackages(source, fileName) {
    const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
    const found = new Set();
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (
          !specifier.startsWith(".") &&
          !specifier.startsWith("node:") &&
          !specifier.startsWith("@/")
        ) {
          const parts = specifier.split("/");
          found.add(specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
    return found;
  }

  it("is exactly the set enumerated here", () => {
    const imported = [...importedByExcludedFiles()].sort();
    const listed = [...DOES_NOT_AUTHENTICATE].sort();
    assert.deepEqual(imported, listed);
  });

  it("finds packages behind the exclusions to prove against", () => {
    assert.ok(
      importedByExcludedFiles().size > 0,
      "no excluded file imports a package, so this pin holds vacuously",
    );
  });
});

describe("the names the rule's own words are written in", () => {
  // The rule says "auth, audit ledgers, approval gates, secret handling,
  // signature verification". A matcher holding only the singular followed by a
  // separator reads `audit/` and lets `auditing/` past, which is a gate anyone
  // closes by pluralising a directory.
  const critical = (path) => isSecurityCritical(path, "export const x = 1;");

  for (const path of [
    "src/audit/ledger.ts",
    "src/audits/trail.ts",
    "src/audited/entry.ts",
    "src/auditing/ledger.ts",
    "src/auditor/report.ts",
    "src/auditors/report.ts",
    "src/approval/gate.ts",
    "src/approvals/gate.ts",
    "src/approver/chain.ts",
    "src/approvers/chain.ts",
    "src/ledger/append.ts",
    "src/ledgers/append.ts",
    "src/secret/vault.ts",
    "src/secrets/vault.ts",
    "src/signature/verify.ts",
    "src/signatures/verify.ts",
    "src/verifier/webhook.ts",
    "src/verifiers/webhook.ts",
    "src/authz.ts",
    "src/authorization/policy.ts",
    "src/api-key.ts",
    "src/api-keys/rotate.ts",
    "src/audit-log.ts",
  ]) {
    it(`classifies ${path}`, () => assert.equal(critical(path), true));
  }

  // The reason the forms are enumerated rather than produced by a suffix rule:
  // `auth` admits none. A rule reaching `authorization` reaches `author` with
  // it, and an author is not a credential.
  for (const path of [
    "src/author.ts",
    "src/authors/list.ts",
    "src/authoring/editor.ts",
    "src/gateway/router.ts",
    "src/api-gateway/index.ts",
    "src/signal/bus.ts",
    "src/designer.ts",
    "src/keyboard.ts",
    "src/assign.ts",
  ]) {
    it(`does not classify ${path}`, () => assert.equal(critical(path), false));
  }

  it("holds every security-critical directory the catalog ships", () => {
    // The enumeration above is a list, so it answers to the tree. Every
    // directory in the catalog named for one of the rule's concerns has to
    // come out classified, or the list has drifted from what ships.
    const shipped = new Set();
    for (const name of readdirSync(TEMPLATES).sort()) {
      let files;
      try {
        files = walk(join(TEMPLATES, name, "skeleton"));
      } catch {
        continue;
      }
      for (const file of files) {
        if (!/\.tsx?$/.test(file)) continue;
        if (/(^|\/)(auth|audit|approval|ledger|secret|signature)s?(\/|$)/i.test(file)) {
          shipped.add(`${name}/${file}`);
        }
      }
    }
    assert.ok(shipped.size > 0, "no security-critical directory found — the walk is broken");
    for (const path of shipped) {
      const file = path.slice(path.indexOf("/") + 1);
      assert.equal(critical(file), true, `${path} is not classified`);
    }
  });
});

describe("the corpus both gates read", () => {
  it("reaches a config below a skeleton's root", () => {
    // A skeleton's code does not always sit at its root. A walk fixed at
    // `templates/*/skeleton/vitest.config.ts` misses a package under
    // `packages/` or `sdk/`, and one of those ships a real exclusion.
    const configs = skeletonConfigs(ROOT).map((c) => relative(ROOT, c).split("\\").join("/"));
    assert.ok(configs.includes("templates/prompt-library/skeleton/sdk/vitest.config.ts"));
    assert.ok(configs.includes("templates/monorepo/skeleton/packages/shared-ui/vitest.config.ts"));
  });

  it("leaves no package that declares vitest unaccounted for", () => {
    // The account is derived from the manifests, so it is not the walk marking
    // its own homework. A config the walk cannot reach is a directory this
    // names and the walk does not.
    assert.deepEqual(unaccountedSkeletons(ROOT, skeletonConfigs(ROOT)), []);
  });

  it("notices a package the walk cannot reach", () => {
    // The control: the accounting has to be able to fail, or passing says
    // nothing. A manifest declaring vitest with no config beside it is exactly
    // the shape a shallow walk produced.
    const scratch = mkdtempSync(join(tmpdir(), "corpus-"));
    try {
      const deep = join(scratch, "templates", "example", "skeleton", "packages", "inner");
      execFileSync("mkdir", ["-p", deep]);
      writeFileSync(
        join(deep, "package.json"),
        JSON.stringify({ name: "inner", devDependencies: { vitest: "^4.0.0" } }),
      );
      assert.deepEqual(
        unaccountedSkeletons(scratch, skeletonConfigs(scratch)).map((d) =>
          relative(scratch, d.dir),
        ),
        ["templates/example/skeleton/packages/inner"],
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe("the gate as a command", () => {
  // The predicates above are exported and tested directly, which says nothing
  // about the program that calls them: its exit codes, its refusals, and
  // whether a finding reaches stderr at all.
  const run = (root) => {
    try {
      const stdout = execFileSync(
        process.execPath,
        [join(ROOT, "scripts", "check-coverage-exclusions.mjs"), root],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
      );
      return { status: 0, out: stdout };
    } catch (error) {
      return { status: error.status, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
  };

  /** A catalog of one skeleton, built from files given as path → contents. */
  const catalog = (files) => {
    const scratch = mkdtempSync(join(tmpdir(), "gate-"));
    cpSync(join(ROOT, "standards"), join(scratch, "standards"), { recursive: true });
    for (const [path, contents] of Object.entries(files)) {
      const full = join(scratch, "templates", "example", "skeleton", path);
      execFileSync("mkdir", ["-p", join(full, "..")]);
      writeFileSync(full, contents);
    }
    return scratch;
  };

  const config = (exclude) =>
    'import { defineConfig } from "vitest/config";\n' +
    `export default defineConfig({ test: { coverage: { exclude: ${JSON.stringify(exclude)} } } });`;

  it("passes a skeleton whose exclusions all resolve and none are critical", () => {
    const root = catalog({
      "vitest.config.ts": config(["src/types.ts"]),
      "package.json": JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
      "src/types.ts": "export interface A { a: string }\n",
      "src/main.ts": "export function main() { return 1; }\n",
    });
    try {
      const { status, out } = run(root);
      assert.equal(status, 0, out);
      assert.match(out, /1 skeleton vitest config/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits 1 naming a security-critical file an exclusion removes", () => {
    const root = catalog({
      "vitest.config.ts": config(["src/webhooks/verify.ts"]),
      "package.json": JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
      "src/webhooks/verify.ts":
        'import { createHmac } from "node:crypto";\n' +
        "export function verify(body: string, secret: string, given: string): boolean {\n" +
        '  return createHmac("sha256", secret).update(body).digest("hex") === given;\n' +
        "}\n",
    });
    try {
      const { status, out } = run(root);
      assert.equal(status, 1);
      assert.match(out, /src\/webhooks\/verify\.ts/);
      assert.match(out, /signs or verifies with a key/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits 1 naming an exclusion that removes nothing", () => {
    const root = catalog({
      "vitest.config.ts": config(["src/renamed.ts"]),
      "package.json": JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
      "src/main.ts": "export function main() { return 1; }\n",
    });
    try {
      const { status, out } = run(root);
      assert.equal(status, 1);
      assert.match(out, /matches no file/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not call an exclusion unresolvable for naming a build directory", () => {
    // The walk declines to enter `dist`, so requiring a file there would make
    // the entry unresolvable however it is written.
    const root = catalog({
      "vitest.config.ts": config(["dist/**", "src/**/*.test.ts"]),
      "package.json": JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
      "src/main.test.ts": "export const t = 1;\n",
    });
    try {
      const { status, out } = run(root);
      assert.equal(status, 0, out);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits 1 naming an exclusion it cannot read", () => {
    const root = catalog({
      "vitest.config.ts":
        'import { defineConfig } from "vitest/config";\n' +
        "export default defineConfig({ test: { coverage: { exclude: [`\u0024{dir}/a.ts`] } } });",
      "package.json": JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
      "src/main.ts": "export function main() { return 1; }\n",
    });
    try {
      const { status, out } = run(root);
      assert.equal(status, 1);
      assert.match(out, /not a literal string/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits 2 over an empty corpus rather than reporting success", () => {
    const scratch = mkdtempSync(join(tmpdir(), "gate-"));
    cpSync(join(ROOT, "standards"), join(scratch, "standards"), { recursive: true });
    execFileSync("mkdir", ["-p", join(scratch, "templates")]);
    try {
      const { status, out } = run(scratch);
      assert.equal(status, 2);
      assert.match(out, /asserting nothing/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("exits 2 when a package declares vitest and the walk found no config for it", () => {
    const root = catalog({
      "vitest.config.ts": config(["src/types.ts"]),
      "package.json": JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
      "src/types.ts": "export interface A { a: string }\n",
      "packages/inner/package.json": JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
    });
    try {
      const { status, out } = run(root);
      assert.equal(status, 2);
      assert.match(out, /declare vitest/);
      assert.match(out, /packages\/inner/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits 2 when the standard retires the rule it enforces", () => {
    const root = catalog({
      "vitest.config.ts": config(["src/types.ts"]),
      "package.json": JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
      "src/types.ts": "export interface A { a: string }\n",
    });
    try {
      const standard = join(root, "standards", "testing-rubric.json");
      const rubric = JSON.parse(readFileSync(standard, "utf-8"));
      rubric.content.rules = rubric.content.rules.filter((r) => r.id !== "security-critical-100");
      writeFileSync(standard, JSON.stringify(rubric, null, 2));
      const { status, out } = run(root);
      assert.equal(status, 2);
      assert.match(out, /security-critical-100/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
