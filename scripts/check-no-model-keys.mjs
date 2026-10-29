#!/usr/bin/env node
//
// check-no-model-keys.mjs — fail if a template or composite reads a
// model-provider API key or ships a provider that authenticates with one.
//
// `standards/llm-policy.json` rule `iam-role-auth` permits no provider key,
// on the substrate or off it: an application on the substrate calls its
// Platform's ModelGateway, which holds the Bedrock role, and one off it
// reaches Bedrock under an IAM role it assumes. A key path is easy to
// reintroduce and invisible to every other gate, because it renders, builds
// and passes its own tests, so this refuses its three signatures wherever a
// scaffold could carry them:
//
//   1. A model-provider key env var, read in code or set in a `.env.example`,
//      a workflow, a chart value or a manifest default. A framework prefix
//      (`VITE_`, `NEXT_PUBLIC_`) does not hide one.
//
//   2. A dependency on a provider SDK or framework adapter that
//      authenticates with a key, in package.json, pyproject.toml,
//      requirements*.txt, go.mod, pom.xml or a Gradle build.
//
//   3. A direct-API endpoint host, which only a key-holding client calls.
//
// Every text file under templates/ and composites/ is read, skeletons
// included, except three kinds the scaffold's own source does not carry:
// build output and installed dependencies (the SKIP_DIRS directories),
// lockfiles (`package-lock.json` and `*.lock`), which pin the transitive
// packages of the dependencies the manifest beside them declares, and
// binaries (a BINARY extension, or a NUL byte in the text). The renderer
// only substitutes placeholders and drops conditional files, so a source
// file that passes here renders into no scaffold that fails.
//
// One line shape is exempt: a test that seeds a key with `vi.stubEnv` and a
// value ending `must-not-leave`, to prove a provider never forwards an
// ambient key. It sits under `__tests__/` or in a `*.test.*` file.
//
// Usage: node scripts/check-no-model-keys.mjs [root]

import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Model-provider key env vars, without any framework prefix. */
export const KEY_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "GROQ_API_KEY",
  "COHERE_API_KEY",
  "CO_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "MISTRAL_API_KEY",
  "HF_TOKEN",
  "HUGGINGFACE_API_KEY",
  "HUGGINGFACEHUB_API_TOKEN",
  "HUGGING_FACE_HUB_TOKEN",
  "TOGETHER_API_KEY",
  "FIREWORKS_API_KEY",
  "DEEPSEEK_API_KEY",
  "XAI_API_KEY",
  "PERPLEXITY_API_KEY",
  "OPENROUTER_API_KEY",
  "VOYAGE_API_KEY",
  "REPLICATE_API_TOKEN",
  "AWS_BEARER_TOKEN_BEDROCK",
  "LLM_API_KEY",
  "EMBEDDING_API_KEY",
];

/** Provider SDKs and framework adapters that authenticate with a key, per manifest kind. */
export const KEY_SDKS = {
  npm: [
    "@anthropic-ai/sdk",
    "openai",
    "@azure/openai",
    "groq-sdk",
    "cohere-ai",
    "@google/genai",
    "@google/generative-ai",
    "@mistralai/mistralai",
    "@huggingface/inference",
    "replicate",
    "together-ai",
    "@ai-sdk/anthropic",
    "@ai-sdk/openai",
    "@ai-sdk/azure",
    "@ai-sdk/google",
    "@ai-sdk/mistral",
    "@ai-sdk/groq",
    "@ai-sdk/cohere",
    "@langchain/anthropic",
    "@langchain/openai",
    "@langchain/groq",
    "@langchain/cohere",
    "@langchain/mistralai",
    "@langchain/google-genai",
  ],
  pypi: [
    "anthropic",
    "openai",
    "groq",
    "cohere",
    "google-generativeai",
    "google-genai",
    "mistralai",
    "together",
    "replicate",
    "langchain-anthropic",
    "langchain-openai",
    "langchain-groq",
    "langchain-cohere",
    "langchain-mistralai",
    "langchain-google-genai",
  ],
  go: [
    "github.com/anthropics/anthropic-sdk-go",
    "github.com/openai/openai-go",
    "github.com/sashabaranov/go-openai",
    "github.com/google/generative-ai-go",
    "google.golang.org/genai",
    "github.com/cohere-ai/cohere-go",
  ],
  maven: [
    "anthropic-java",
    "openai-java",
    "langchain4j-anthropic",
    "langchain4j-open-ai",
    "langchain4j-mistral-ai",
    "langchain4j-google-ai-gemini",
    "spring-ai-anthropic",
    "spring-ai-openai",
    "spring-ai-starter-model-anthropic",
    "spring-ai-starter-model-openai",
  ],
};

/** Direct-API endpoint hosts of model providers. */
export const KEY_HOSTS = [
  "api.anthropic.com",
  "api.openai.com",
  "openai.azure.com",
  "api.groq.com",
  "api.cohere.com",
  "api.cohere.ai",
  "generativelanguage.googleapis.com",
  "api.mistral.ai",
  "api-inference.huggingface.co",
  "router.huggingface.co",
  "api.together.xyz",
  "api.fireworks.ai",
  "api.deepseek.com",
  "api.x.ai",
  "openrouter.ai",
  "api.voyageai.com",
];

const literal = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A letter or digit before the name would make it another variable; an
// underscore is a prefix such as VITE_, which still exposes the key.
const KEY_ENV = new RegExp(`(?<![A-Za-z0-9])(?:${KEY_ENV_VARS.join("|")})(?![A-Za-z0-9_])`, "g");
// A whole host name: dot-separated labels of letters, digits and dashes,
// matched greedily so a token is never part of a longer name.
const HOST_NAME = /[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const LEAK_TEST = /\bvi\.stubEnv\(\s*["']([A-Z0-9_]+)["']\s*,\s*["'][^"']*must-not-leave["']\s*\)/;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".turbo",
  "build",
  "target",
]);
const BINARY =
  /\.(?:png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|jar|wasm|mp3|mp4|wav|ogg|flac|webm|m4a)$/i;

/** Whether `path` is a test file, where the leak-test exemption applies. */
export function isTestFile(path) {
  return /(?:^|\/)__tests__\//.test(path) || /\.test\.[cm]?[jt]sx?$/.test(path);
}

/**
 * The direct-API host `name` is or sits under, or undefined. A subdomain, such
 * as a regional endpoint or an Azure resource name, is still the provider's
 * API; a name that only shares a suffix without the dot is another host.
 */
function directApiHost(name) {
  const host = name.toLowerCase();
  return KEY_HOSTS.find((api) => host === api || host.endsWith(`.${api}`));
}

/** Key env vars and endpoint hosts `text` names, as findings. */
export function findKeyReferences(path, text) {
  const findings = [];
  const testFile = isTestFile(path);
  text.split("\n").forEach((line, i) => {
    const exempt = testFile ? LEAK_TEST.exec(line) : null;
    for (const [name] of line.matchAll(KEY_ENV)) {
      if (exempt?.[1].endsWith(name)) continue;
      findings.push({ path, line: i + 1, kind: "key env var", match: name });
    }
    for (const [name] of line.matchAll(HOST_NAME)) {
      const host = directApiHost(name);
      if (host) findings.push({ path, line: i + 1, kind: "direct-API host", match: host });
    }
  });
  return findings;
}

/** The PEP 503 form of a Python distribution name. */
function pep503(name) {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

/** The line of `text` a needle first appears on, 1-based; 1 when it does not. */
function lineOf(text, needle) {
  const at = text.indexOf(needle);
  return at < 0 ? 1 : text.slice(0, at).split("\n").length;
}

/** Key-provider dependencies a manifest file declares, as findings. */
export function findKeyDependencies(path, text) {
  const file = basename(path);
  const found = [];
  const hit = (name, needle = name) =>
    found.push({ path, line: lineOf(text, needle), kind: "key-provider SDK", match: name });

  if (file === "package.json") {
    const pkg = JSON.parse(text);
    const declared = [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ].flatMap((field) => Object.keys(pkg[field] ?? {}));
    for (const name of declared) if (KEY_SDKS.npm.includes(name)) hit(name, `"${name}"`);
  } else if (file === "pyproject.toml" || /^requirements.*\.txt$/.test(file)) {
    const banned = new Set(KEY_SDKS.pypi.map(pep503));
    const names =
      file === "pyproject.toml"
        ? [
            ...text.matchAll(
              /["']\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:[<>=!~;@][^"']*)?["']/g,
            ),
          ]
        : [...text.matchAll(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/gm)];
    for (const [, name] of names) if (banned.has(pep503(name))) hit(name);
  } else if (file === "go.mod") {
    for (const module of KEY_SDKS.go)
      if (new RegExp(`(?:^|\\s)${literal(module)}(?:/v\\d+)?\\s`, "m").test(text)) hit(module);
  } else if (file === "pom.xml" || /^build\.gradle(?:\.kts)?$/.test(file)) {
    for (const artifact of KEY_SDKS.maven)
      if (new RegExp(`(?:<artifactId>|:)${literal(artifact)}(?:</artifactId>|[:"'])`).test(text))
        hit(artifact);
  }
  return found;
}

/** Every file under `dir`, skipping build output and binaries. */
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (!BINARY.test(entry.name) && !/^package-lock\.json$|\.lock$/.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

/** Every key reference and key-provider dependency under templates/ and composites/. */
export function scan(root) {
  const findings = [];
  let files = 0;
  for (const top of ["templates", "composites"]) {
    let tree;
    try {
      tree = [...walk(join(root, top))];
    } catch {
      continue;
    }
    for (const full of tree) {
      const path = relative(root, full).split("\\").join("/");
      const text = readFileSync(full, "utf-8");
      if (text.includes("\0")) continue;
      files += 1;
      findings.push(...findKeyReferences(path, text), ...findKeyDependencies(path, text));
    }
  }
  return { files, findings };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = resolve(process.argv[2] ?? ".");
  const { files, findings } = scan(root);
  if (files === 0) {
    console.error(
      `check-no-model-keys: read no file under ${root}/templates or ${root}/composites. ` +
        "The catalog ships both, so this is the walk breaking rather than the catalog " +
        "losing them.",
    );
    process.exit(2);
  }
  if (findings.length > 0) {
    console.error(
      `check-no-model-keys: ${findings.length} model-provider key path(s).\n` +
        "standards/llm-policy.json iam-role-auth permits no provider API key. On the\n" +
        "substrate a model is reached through the Platform's ModelGateway; off it, through\n" +
        "Bedrock under an IAM role the application assumes.",
    );
    for (const f of findings) console.error(`  ${f.path}:${f.line}  ${f.kind}  ${f.match}`);
    process.exit(1);
  }
  console.log(
    `check-no-model-keys: ${files} file(s) under templates/ and composites/ read no ` +
      "model-provider key, depend on no key-provider SDK and call no direct-API host.",
  );
}
