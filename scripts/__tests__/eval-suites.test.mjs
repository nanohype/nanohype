import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as yaml from "js-yaml";
import { callsGateway, dependsOnProvider, inEvalScope } from "../check-eval-suites.mjs";

// Scope for the eval requirement is decided by what a template declares: the
// SDK dependencies in its skeleton's package.json, and the `model-gateway` tag
// in its manifest for a skeleton that reaches a model through the Platform's
// ModelGateway with a plain fetch. Both are claims about how the catalog
// reaches a model, so each is pinned against the tree: a model-invoking
// package present in the tree and absent from the classifier fails here, and
// so does a skeleton that registers a gateway provider under a manifest that
// does not carry the tag. Either would narrow scope in silence.
//
// The regression this exists for: scope was decided by matching five SDK call
// spellings. A streaming call was not among them, so switching a template to
// it and deleting its eval tree left the gate green.

const ROOT = new URL("../..", import.meta.url).pathname;
const TEMPLATES = join(ROOT, "templates");
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", "__tests__"]);
const REGISTERS_GATEWAY = /\bregister\w*\(\s*"gateway"/;

/** Every dependency any skeleton in the catalog declares, with its template. */
function declaredDependencies() {
  const out = new Map();
  for (const name of readdirSync(TEMPLATES).sort()) {
    const pkgPath = join(TEMPLATES, name, "skeleton", "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    for (const dep of Object.keys({
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
    })) {
      if (!out.has(dep)) out.set(dep, []);
      out.get(dep).push(name);
    }
  }
  return out;
}

/** Whether any non-test source file under `dir` registers a provider named "gateway". */
function registersGateway(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (registersGateway(full)) return true;
    } else if (SOURCE_FILE.test(entry.name) && !/\.test\./.test(entry.name)) {
      if (REGISTERS_GATEWAY.test(readFileSync(full, "utf-8"))) return true;
    }
  }
  return false;
}

/** The templates whose skeleton registers a gateway provider, with their manifests. */
function gatewayTemplates() {
  const out = [];
  for (const name of readdirSync(TEMPLATES).sort()) {
    const skeleton = join(TEMPLATES, name, "skeleton");
    if (!existsSync(join(TEMPLATES, name, "template.yaml")) || !existsSync(skeleton)) continue;
    if (!registersGateway(skeleton)) continue;
    const manifest = yaml.load(readFileSync(join(TEMPLATES, name, "template.yaml"), "utf-8"));
    out.push({ name, manifest });
  }
  return out;
}

// Packages that invoke a model, spelled as the registry spells them: Bedrock's
// runtime clients, and the provider SDKs. A package matching this and absent
// from the classifier is a scope hole. Bedrock's control-plane client, which
// manages jobs and lists models without invoking one, is not among them.
const LOOKS_LIKE_A_PROVIDER =
  /^(@anthropic-ai\/|openai$|@aws-sdk\/client-bedrock(?:-[a-z-]+)?-runtime$|@google\/gen|@google\/generative-ai|@mistralai\/|cohere-ai$|@azure\/openai|replicate$|groq-sdk$)/;

describe("dependsOnProvider", () => {
  it("holds for a skeleton declaring the Bedrock runtime SDK", () => {
    assert.equal(
      dependsOnProvider({ dependencies: { "@aws-sdk/client-bedrock-runtime": "^3" } }),
      true,
    );
  });

  it("holds wherever the dependency is declared", () => {
    // A provider reached only from a dev-time script is still reached.
    for (const field of ["devDependencies", "peerDependencies"])
      assert.equal(
        dependsOnProvider({ [field]: { "@aws-sdk/client-bedrock-runtime": "^3" } }),
        true,
      );
  });

  it("does not hold for a skeleton declaring none", () => {
    assert.equal(dependsOnProvider({ dependencies: { hono: "^4", zod: "^3" } }), false);
    assert.equal(dependsOnProvider({}), false);
  });

  it("does not hold for a package that merely sends messages", () => {
    // Twilio's SMS client calls `messages.create`, which a matcher over call
    // spellings read as a model call.
    assert.equal(dependsOnProvider({ dependencies: { twilio: "^5" } }), false);
  });

  it("covers every provider package the catalog declares", () => {
    // Derived from the tree: if a skeleton depends on something that looks
    // like a model provider and the classifier does not recognise it, that
    // template is outside the eval requirement without anything saying so.
    const missed = [];
    for (const [dep, templates] of declaredDependencies()) {
      if (!LOOKS_LIKE_A_PROVIDER.test(dep)) continue;
      if (dependsOnProvider({ dependencies: { [dep]: "*" } })) continue;
      missed.push(`${dep} (declared by ${templates.join(", ")})`);
    }
    assert.deepEqual(missed, []);
  });

  it("finds provider packages in the catalog to prove against", () => {
    const providers = [...declaredDependencies().keys()].filter((d) =>
      LOOKS_LIKE_A_PROVIDER.test(d),
    );
    assert.ok(providers.length > 0, "no provider package in the catalog to prove against");
  });
});

describe("inEvalScope", () => {
  it("holds for a manifest tagged model-gateway whose skeleton depends on no SDK", () => {
    const manifest = { tags: ["typescript", "model-gateway"] };
    assert.equal(callsGateway(manifest), true);
    assert.equal(inEvalScope(manifest, { dependencies: { zod: "^4" } }), true);
  });

  it("holds for a skeleton depending on the Bedrock runtime SDK under an untagged manifest", () => {
    assert.equal(
      inEvalScope({ tags: [] }, { dependencies: { "@aws-sdk/client-bedrock-runtime": "^3" } }),
      true,
    );
  });

  it("does not hold for neither", () => {
    assert.equal(inEvalScope({ tags: ["typescript"] }, { dependencies: { zod: "^4" } }), false);
    assert.equal(inEvalScope({}, {}), false);
  });

  it("is declared by every template whose skeleton registers a gateway provider", () => {
    const untagged = gatewayTemplates()
      .filter(({ manifest }) => !callsGateway(manifest))
      .map(({ name }) => name);
    assert.deepEqual(untagged, []);
  });

  it("finds templates that register a gateway provider to prove against", () => {
    assert.ok(gatewayTemplates().length > 0, "no skeleton registers a gateway provider");
  });
});
