import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as yaml from "js-yaml";
import { renderComposite } from "../../sdk/dist/composite.js";
import { renderTemplate } from "../../sdk/dist/renderer.js";
import { LocalSource } from "../../sdk/dist/sources/local.js";

// A template that names its provider in one variable and carries the
// providers that variable may name behind a bool renders cleanly when the two
// disagree, and the project then throws "Unknown provider" at its first model
// call. `ProviderCheck` composes the two into one string whose validation
// pattern rejects every disagreeing pair, so the scaffold fails instead. It is
// derived: a value the caller supplied would be the string the pattern sees,
// so the resolver rejects one.
//
// These render real catalog templates through the SDK: what they pin is what
// a consumer receives, the composed default and the pattern together.

const ROOT = new URL("../..", import.meta.url).pathname;
const TEMPLATES = join(ROOT, "templates");
const SELECTORS = ["LlmProvider", "EmbeddingProvider", "DefaultProvider"];

const source = new LocalSource({ rootDir: ROOT });

function manifestOf(template) {
  return yaml.load(readFileSync(join(TEMPLATES, template, "template.yaml"), "utf-8"));
}

async function render(template, vars) {
  const { files } = await source.fetchTemplate(template);
  return renderTemplate(manifestOf(template), files, { ProjectName: "probe", ...vars });
}

async function rejects(template, vars) {
  await assert.rejects(
    async () => render(template, vars),
    /ProviderCheck|provider API key|leaves out/,
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

const KEY_PAIR = [
  "a2a-agent",
  "agent-orchestrator",
  "agentic-loop",
  "ci-eval",
  "discord-bot",
  "eval-harness",
  "multimodal-pipeline",
  "next-app",
  "slack-bot",
];

describe("ProviderCheck", () => {
  it("is declared by every template that gates its key providers behind IncludeKeyProviders", () => {
    for (const name of readdirSync(TEMPLATES).sort()) {
      let manifest;
      try {
        manifest = manifestOf(name);
      } catch {
        continue;
      }
      const vars = manifest.variables ?? [];
      const names = new Set(vars.map((v) => v.name));
      const selectors = SELECTORS.filter((s) => names.has(s));
      if (!names.has("IncludeKeyProviders") || selectors.length === 0) continue;
      const check = vars.find((v) => v.name === "ProviderCheck");
      assert.ok(
        check,
        `${name}: ${selectors.join(", ")} with IncludeKeyProviders and no ProviderCheck`,
      );
      for (const s of selectors)
        assert.match(check.default, new RegExp(`\\$\\{${s}\\}`), `${name}: check omits ${s}`);
      assert.match(
        check.default,
        /\$\{IncludeKeyProviders\}/,
        `${name}: check omits IncludeKeyProviders`,
      );
      assert.ok(check.validation?.pattern, `${name}: ProviderCheck carries no pattern`);
      assert.equal(check.derived, true, `${name}: ProviderCheck is not derived`);
    }
  });

  it("is derived in every composite that declares it, and refuses a value set for it", async () => {
    const composites = await source.listComposites();
    let checked = 0;
    for (const { name } of composites) {
      const manifest = await source.fetchComposite(name);
      const check = (manifest.variables ?? []).find((v) => v.name === "ProviderCheck");
      if (!check) continue;
      checked += 1;
      assert.equal(check.derived, true, `${name}: ProviderCheck is not derived`);
      const values = { ProviderCheck: "gateway:true" };
      for (const v of manifest.variables)
        if (v.required && v.default === undefined)
          values[v.name] = v.type === "bool" ? false : "probe";
      await assert.rejects(
        async () => renderComposite(manifest, values, source),
        /Variable 'ProviderCheck' is derived/,
        `${name}: a value set for ProviderCheck was taken`,
      );
    }
    assert.ok(checked > 0, "no composite declares ProviderCheck");
  });

  for (const template of KEY_PAIR) {
    it(`${template}: rejects a key provider the project leaves out and renders every agreeing pair`, async () => {
      await renders(template, {});
      await renders(template, { LlmProvider: "gateway" });
      await renders(template, { LlmProvider: "my-provider" });
      await rejects(template, { LlmProvider: "anthropic" });
      await rejects(template, { LlmProvider: "openai" });
      await refusesOverride(template, { LlmProvider: "anthropic" });
      await renders(template, { LlmProvider: "anthropic", IncludeKeyProviders: true });
      await renders(template, { LlmProvider: "openai", IncludeKeyProviders: true });
    });
  }

  it("llm-wiki: anthropic needs IncludeKeyProviders", async () => {
    await renders("llm-wiki", {});
    await rejects("llm-wiki", { LlmProvider: "anthropic" });
    await refusesOverride("llm-wiki", { LlmProvider: "anthropic" });
    await renders("llm-wiki", { LlmProvider: "anthropic", IncludeKeyProviders: true });
  });

  for (const template of ["data-pipeline", "module-semantic-cache"]) {
    it(`${template}: an openai embedder needs IncludeKeyProviders`, async () => {
      await renders(template, {});
      await renders(template, { EmbeddingProvider: "bedrock" });
      await rejects(template, { EmbeddingProvider: "openai" });
      await refusesOverride(template, { EmbeddingProvider: "openai" });
      await renders(template, { EmbeddingProvider: "openai", IncludeKeyProviders: true });
    });
  }

  it("module-llm-gateway: anthropic, openai and groq need IncludeKeyProviders", async () => {
    await renders("module-llm-gateway", {});
    await renders("module-llm-gateway", { DefaultProvider: "bedrock" });
    for (const p of ["anthropic", "openai", "groq"]) {
      await rejects("module-llm-gateway", { DefaultProvider: p });
      await refusesOverride("module-llm-gateway", { DefaultProvider: p });
      await renders("module-llm-gateway", { DefaultProvider: p, IncludeKeyProviders: true });
    }
  });

  it("rag-pipeline: checks the generation and the embedding provider independently", async () => {
    await renders("rag-pipeline", {});
    await rejects("rag-pipeline", { LlmProvider: "anthropic" });
    await rejects("rag-pipeline", { EmbeddingProvider: "openai" });
    await rejects("rag-pipeline", { EmbeddingProvider: "cohere" });
    await refusesOverride("rag-pipeline", {
      LlmProvider: "anthropic",
      EmbeddingProvider: "cohere",
    });
    await rejects("rag-pipeline", { LlmProvider: "openai", EmbeddingProvider: "cohere" });
    await renders("rag-pipeline", { LlmProvider: "anthropic", IncludeKeyProviders: true });
    await renders("rag-pipeline", { EmbeddingProvider: "cohere", IncludeKeyProviders: true });
    await renders("rag-pipeline", {
      LlmProvider: "openai",
      EmbeddingProvider: "openai",
      IncludeKeyProviders: true,
    });
  });

  it("module-llm-providers: each provider needs the bool that carries it, and only that one", async () => {
    const t = "module-llm-providers";
    await renders(t, {});
    for (const p of ["anthropic", "openai", "groq"]) {
      await rejects(t, { DefaultProvider: p });
      await refusesOverride(t, { DefaultProvider: p });
      await rejects(t, {
        DefaultProvider: p,
        IncludeBedrock: true,
        IncludeVertex: true,
        IncludeHuggingFace: true,
        IncludeOllama: true,
      });
      await renders(t, { DefaultProvider: p, IncludeKeyProviders: true });
    }
    const optional = {
      bedrock: "IncludeBedrock",
      vertex: "IncludeVertex",
      huggingface: "IncludeHuggingFace",
      ollama: "IncludeOllama",
    };
    for (const [p, flag] of Object.entries(optional)) {
      const others = Object.fromEntries(
        Object.values(optional)
          .filter((f) => f !== flag)
          .map((f) => [f, true]),
      );
      await rejects(t, { DefaultProvider: p });
      await rejects(t, { DefaultProvider: p, IncludeKeyProviders: true, ...others });
      await renders(t, { DefaultProvider: p, [flag]: true });
    }
  });
});
