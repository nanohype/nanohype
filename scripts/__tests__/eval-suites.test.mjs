import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { dependsOnProvider } from "../check-eval-suites.mjs";

// Scope for the eval requirement is decided by the dependencies a skeleton
// declares. That is a claim about the packages the catalog uses to reach a
// model, so it is pinned against them: a provider package present in the tree
// and absent from the classifier fails here rather than narrowing scope in
// silence.
//
// The regression this exists for: scope was decided by matching five SDK call
// spellings. The same Anthropic SDK's `messages.stream` was not among them, so
// switching a template to it and deleting its eval tree left the gate green.

const ROOT = new URL("../..", import.meta.url).pathname;
const TEMPLATES = join(ROOT, "templates");

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

// Packages that reach a model, spelled as the registry spells them. A package
// matching this and absent from the classifier is a scope hole.
const LOOKS_LIKE_A_PROVIDER =
  /^(@anthropic-ai\/|openai$|@aws-sdk\/client-bedrock|@google\/gen|@google\/generative-ai|@mistralai\/|cohere-ai$|@azure\/openai|replicate$|groq-sdk$)/;

describe("dependsOnProvider", () => {
  it("holds for a skeleton declaring a provider SDK", () => {
    assert.equal(dependsOnProvider({ dependencies: { "@anthropic-ai/sdk": "^1" } }), true);
    assert.equal(dependsOnProvider({ dependencies: { openai: "^1" } }), true);
    assert.equal(
      dependsOnProvider({ dependencies: { "@aws-sdk/client-bedrock-runtime": "^3" } }),
      true,
    );
  });

  it("holds wherever the dependency is declared", () => {
    // A provider reached only from a dev-time script is still reached.
    assert.equal(dependsOnProvider({ devDependencies: { openai: "^1" } }), true);
    assert.equal(dependsOnProvider({ peerDependencies: { openai: "^1" } }), true);
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
