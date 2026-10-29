import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as yaml from "js-yaml";
import { renderTemplate } from "../../sdk/dist/renderer.js";
import { LocalSource } from "../../sdk/dist/sources/local.js";

// A template that names its provider in one variable and carries one of the
// providers that variable may name behind a bool renders cleanly when the two
// disagree, and the project then throws "Unknown provider" at its first model
// call. `ProviderCheck` composes the two into one string whose validation
// pattern rejects every disagreeing pair, so the scaffold fails instead. It is
// derived: a value the caller supplied would be the string the pattern sees,
// so the resolver rejects one.
//
// A gated provider is a skeleton file a single bool includes that registers a
// model provider by name. The suite finds every one from the manifests and
// the skeletons, so a template that gates a provider and declares no check
// fails here, and so does a check left on a template that gates none. The
// renders go through the SDK: what they pin is what a consumer receives, the
// composed default and the pattern together.

const ROOT = new URL("../..", import.meta.url).pathname;
const TEMPLATES = join(ROOT, "templates");
const SELECTORS = ["LlmProvider", "EmbeddingProvider", "DefaultProvider"];
const REGISTERS_PROVIDER = /\bregister(?:Llm|Embedding)?Provider\(\s*"([a-z][a-z0-9-]*)"/g;

const source = new LocalSource({ rootDir: ROOT });

function manifestOf(template) {
  return yaml.load(readFileSync(join(TEMPLATES, template, "template.yaml"), "utf-8"));
}

function isTest(path) {
  return /(?:^|\/)__tests__(?:\/|$)|\.test\.[cm]?[jt]sx?$/.test(path);
}

function* filesUnder(path) {
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) yield* filesUnder(join(path, entry));
  } else {
    yield path;
  }
}

/** The providers a template registers only when a single bool includes the file. */
function gatedProviders(template, manifest) {
  const bools = new Set(
    (manifest.variables ?? []).filter((v) => v.type === "bool").map((v) => v.name),
  );
  const gated = [];
  for (const { path, when } of manifest.conditionals ?? []) {
    if (!bools.has(when) || isTest(path)) continue;
    const target = join(TEMPLATES, template, "skeleton", path);
    for (const file of filesUnder(target)) {
      if (isTest(file.slice(target.length))) continue;
      for (const [, provider] of readFileSync(file, "utf-8").matchAll(REGISTERS_PROVIDER))
        gated.push({ provider, flag: when });
    }
  }
  return gated;
}

/** Every template that declares a provider selector, with what it gates. */
function selectorTemplates() {
  const found = [];
  for (const name of readdirSync(TEMPLATES).sort()) {
    let manifest;
    try {
      manifest = manifestOf(name);
    } catch {
      continue;
    }
    const vars = manifest.variables ?? [];
    const selectors = SELECTORS.filter((s) => vars.some((v) => v.name === s));
    if (selectors.length === 0) continue;
    found.push({ name, manifest, selectors, gated: gatedProviders(name, manifest) });
  }
  return found;
}

async function render(template, vars) {
  const { files } = await source.fetchTemplate(template);
  return renderTemplate(manifestOf(template), files, { ProjectName: "probe", ...vars });
}

async function rejects(template, vars) {
  await assert.rejects(
    async () => render(template, vars),
    /ProviderCheck/,
    `${template}: ${JSON.stringify(vars)} rendered`,
  );
}

/** The scaffold refuses a value set for ProviderCheck, even one its pattern accepts. */
async function refusesOverride(template, vars) {
  await assert.rejects(
    async () => render(template, { ...vars, ProviderCheck: "gateway:true" }),
    /Variable 'ProviderCheck' is derived/,
    `${template}: a value set for ProviderCheck was taken`,
  );
}

async function renders(template, vars) {
  const result = await render(template, vars);
  const line = result.files
    .map((f) => f.content.match(/Scaffolded with [^\n]*/)?.[0])
    .find(Boolean);
  assert.ok(line, `${template}: no rendered "Scaffolded with" line carries the check`);
  assert.doesNotMatch(line, /__PROVIDER_CHECK__/);
  return line;
}

describe("ProviderCheck", () => {
  const templates = selectorTemplates();
  const gating = templates.filter((t) => t.gated.length > 0);

  it("finds a template that gates a provider behind a bool", () => {
    assert.ok(
      gating.length > 0,
      "no template gates a provider, so nothing below checks a ProviderCheck",
    );
  });

  it("is declared, derived and patterned by every template that gates a provider, and by no other", () => {
    for (const { name, manifest, selectors, gated } of templates) {
      const check = (manifest.variables ?? []).find((v) => v.name === "ProviderCheck");
      if (gated.length === 0) {
        assert.equal(check, undefined, `${name}: ProviderCheck with no gated provider to check`);
        continue;
      }
      const flags = [...new Set(gated.map((g) => `${g.provider} behind ${g.flag}`))];
      assert.ok(check, `${name}: ${flags.join(", ")} and no ProviderCheck`);
      assert.ok(
        selectors.some((s) => check.default.includes(`\${${s}}`)),
        `${name}: ProviderCheck omits ${selectors.join(" and ")}`,
      );
      for (const { flag } of gated)
        assert.ok(check.default.includes(`\${${flag}}`), `${name}: ProviderCheck omits ${flag}`);
      assert.ok(check.validation?.pattern, `${name}: ProviderCheck carries no pattern`);
      assert.equal(check.derived, true, `${name}: ProviderCheck is not derived`);
    }
  });

  it("rejects each gated provider its bool leaves out, and renders it once the bool is set", async () => {
    for (const { name, selectors, gated } of gating) {
      await renders(name, {});
      for (const { provider, flag } of gated) {
        for (const selector of selectors) {
          await rejects(name, { [selector]: provider, [flag]: false });
          await refusesOverride(name, { [selector]: provider });
          await renders(name, { [selector]: provider, [flag]: true });
        }
      }
    }
  });

  it("module-llm-providers: bedrock needs IncludeBedrock, and every other provider renders without it", async () => {
    const t = "module-llm-providers";
    for (const p of ["gateway", "mock", "my-provider"]) {
      const line = await renders(t, { DefaultProvider: p });
      assert.match(line, new RegExp(`= ${p}:false\\.$`));
    }
    await rejects(t, { DefaultProvider: "bedrock" });
    await refusesOverride(t, { DefaultProvider: "bedrock" });
    assert.match(
      await renders(t, { DefaultProvider: "bedrock", IncludeBedrock: true }),
      /= bedrock:true\.$/,
    );
  });
});
