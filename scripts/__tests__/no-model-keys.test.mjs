import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import {
  findKeyDependencies,
  findKeyReferences,
  KEY_ENV_VARS,
  KEY_HOSTS,
  KEY_SDKS,
  scan,
} from "../check-no-model-keys.mjs";

// The gate refuses a model-provider key path in any template or composite:
// a key env var, a key-provider SDK dependency, or a direct-API host. These
// pin each signature against the file shapes a skeleton carries it in, the one
// exempt line shape, and the gate's exit codes over a fixture catalog, then
// hold the catalog itself to it.

const ROOT = new URL("../..", import.meta.url).pathname;
const GATE = join(ROOT, "scripts", "check-no-model-keys.mjs");
const scratch = mkdtempSync(join(tmpdir(), "no-model-keys-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** A fixture catalog root holding `files`, keyed by root-relative path. */
function fixture(name, files) {
  const root = join(scratch, name);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function matches(findings) {
  return findings.map((f) => `${f.kind}: ${f.match}`);
}

describe("findKeyReferences", () => {
  it("flags every key env var in source, env files, workflows and manifests", () => {
    for (const name of KEY_ENV_VARS) {
      for (const [path, text] of [
        ["templates/t/skeleton/src/config.ts", `const key = process.env.${name};`],
        ["templates/t/skeleton/.env.example", `${name}=`],
        [
          "templates/t/skeleton/.github/workflows/ci.yml",
          `env:\n  ${name}: \${{ secrets.${name} }}`,
        ],
        ["templates/t/template.yaml", `    default: '${name}'`],
      ]) {
        const found = findKeyReferences(path, text);
        assert.ok(
          found.some((f) => f.kind === "key env var" && f.match === name),
          `${path}: ${name} not flagged`,
        );
      }
    }
  });

  it("flags a key env var behind a framework prefix", () => {
    assert.deepEqual(matches(findKeyReferences("src/a.ts", "process.env.VITE_OPENAI_API_KEY")), [
      "key env var: OPENAI_API_KEY",
    ]);
    assert.deepEqual(
      matches(findKeyReferences("src/a.ts", "process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY")),
      ["key env var: ANTHROPIC_API_KEY"],
    );
  });

  it("reports the line the name is on", () => {
    const [found] = findKeyReferences("src/a.ts", "a\nb\nconst k = process.env.GROQ_API_KEY;\n");
    assert.equal(found.line, 3);
  });

  it("leaves keys that reach no model alone", () => {
    for (const name of [
      "PINECONE_API_KEY",
      "QDRANT_API_KEY",
      "ALGOLIA_API_KEY",
      "WORKOS_API_KEY",
      "WIKI_API_KEY",
      "SEARCH_API_KEY",
      "STRIPE_SECRET_KEY",
      "ANTHROPIC_API_KEYRING",
      "XOPENAI_API_KEY",
    ]) {
      assert.deepEqual(findKeyReferences("src/a.ts", `process.env.${name}`), [], name);
    }
  });

  it("exempts a test that seeds a key it proves never leaves", () => {
    const line = 'vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-must-not-leave");';
    assert.deepEqual(findKeyReferences("src/__tests__/gateway.test.ts", line), []);
    assert.deepEqual(findKeyReferences("src/gateway.test.ts", line), []);
  });

  it("does not exempt that line outside a test, or a stub with any other value", () => {
    const line = 'vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-must-not-leave");';
    assert.deepEqual(matches(findKeyReferences("src/setup.ts", line)), [
      "key env var: ANTHROPIC_API_KEY",
    ]);
    assert.deepEqual(
      matches(
        findKeyReferences("src/__tests__/a.test.ts", 'vi.stubEnv("OPENAI_API_KEY", "sk-1");'),
      ),
      ["key env var: OPENAI_API_KEY"],
    );
  });

  it("does not let an exempt stub cover a second key on its line", () => {
    const line = 'vi.stubEnv("ANTHROPIC_API_KEY", "x-must-not-leave"); process.env.OPENAI_API_KEY;';
    assert.deepEqual(matches(findKeyReferences("src/__tests__/a.test.ts", line)), [
      "key env var: OPENAI_API_KEY",
    ]);
  });

  it("flags every direct-API host and its subdomains, and no lookalike", () => {
    for (const host of KEY_HOSTS) {
      assert.deepEqual(
        matches(findKeyReferences("src/a.ts", `fetch("https://${host}/v1/messages")`)),
        [`direct-API host: ${host}`],
        host,
      );
    }
    for (const [text, host] of [
      ["https://eu.api.openai.com/v1/responses", "api.openai.com"],
      ["https://my-resource.openai.azure.com/openai/deployments", "openai.azure.com"],
      ["https://API.Anthropic.com/v1/messages", "api.anthropic.com"],
      ["base_url=api.groq.com:443", "api.groq.com"],
    ]) {
      assert.deepEqual(matches(findKeyReferences("src/a.ts", text)), [`direct-API host: ${host}`]);
    }
    for (const text of [
      "https://notapi.anthropic.com",
      "https://api.openai.community",
      "https://api.openai.com.example.net",
      "https://my-openai.azure.com",
      "https://docs.anthropic.com/en/api",
      "https://platform.openai.com/docs",
      "https://bedrock-runtime.us-east-1.amazonaws.com",
      "http://probe-gateway.tenants-probe.svc.cluster.local:8080/anthropic/v1/messages",
    ]) {
      assert.deepEqual(findKeyReferences("src/a.ts", text), [], text);
    }
  });
});

describe("findKeyDependencies", () => {
  it("flags every key-provider npm package in every dependency field", () => {
    for (const name of KEY_SDKS.npm) {
      for (const field of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ]) {
        const text = JSON.stringify({ name: "probe", [field]: { [name]: "^1.0.0" } }, null, 2);
        assert.deepEqual(matches(findKeyDependencies("skeleton/package.json", text)), [
          `key-provider SDK: ${name}`,
        ]);
      }
    }
  });

  it("leaves the Bedrock SDKs and a package that only shares a prefix alone", () => {
    const text = JSON.stringify({
      dependencies: {
        "@aws-sdk/client-bedrock-runtime": "^3",
        "@aws-sdk/client-bedrock": "^3",
        "openai-tokens": "^1",
        "@anthropic-ai/tokenizer": "^0.1",
      },
    });
    assert.deepEqual(findKeyDependencies("skeleton/package.json", text), []);
  });

  it("flags a key-provider Python distribution in pyproject.toml and requirements", () => {
    for (const name of KEY_SDKS.pypi) {
      const pyproject = `[project]\nname = "probe"\ndependencies = [\n  "boto3>=1.40",\n  "${name}[extra]>=1.0; python_version>'3.11'",\n]\n`;
      assert.deepEqual(matches(findKeyDependencies("skeleton/pyproject.toml", pyproject)), [
        `key-provider SDK: ${name}`,
      ]);
      const requirements = `boto3==1.40.0\n${name.toUpperCase().replaceAll("-", "_")}==1.0\n`;
      assert.equal(findKeyDependencies("skeleton/requirements-dev.txt", requirements).length, 1);
    }
    assert.deepEqual(
      findKeyDependencies("skeleton/pyproject.toml", 'dependencies = ["boto3>=1.40"]'),
      [],
    );
  });

  it("flags a key-provider Go module, versioned or not", () => {
    for (const module of KEY_SDKS.go) {
      const text = `module probe\n\nrequire (\n\t${module}/v2 v2.1.0\n)\n`;
      assert.deepEqual(matches(findKeyDependencies("skeleton/go.mod", text)), [
        `key-provider SDK: ${module}`,
      ]);
    }
    const bedrock = "require github.com/aws/aws-sdk-go-v2/service/bedrockruntime v1.30.0\n";
    assert.deepEqual(findKeyDependencies("skeleton/go.mod", bedrock), []);
  });

  it("flags a key-provider Java artifact in Maven and Gradle builds", () => {
    for (const artifact of KEY_SDKS.maven) {
      const pom = `<dependency><groupId>x</groupId><artifactId>${artifact}</artifactId></dependency>`;
      assert.deepEqual(matches(findKeyDependencies("skeleton/pom.xml", pom)), [
        `key-provider SDK: ${artifact}`,
      ]);
      const gradle = `implementation("x:${artifact}:1.0.0")`;
      assert.equal(findKeyDependencies("skeleton/build.gradle.kts", gradle).length, 1);
    }
    const bedrock = "<artifactId>bedrockruntime</artifactId>";
    assert.deepEqual(findKeyDependencies("skeleton/pom.xml", bedrock), []);
  });
});

describe("check-no-model-keys", () => {
  const clean = {
    "templates/probe/template.yaml": "name: probe\n",
    "templates/probe/skeleton/package.json": JSON.stringify({
      dependencies: { "@aws-sdk/client-bedrock-runtime": "^3" },
    }),
    "templates/probe/skeleton/src/__tests__/gateway.test.ts":
      'vi.stubEnv("OPENAI_API_KEY", "sk-must-not-leave");\n',
    "composites/probe.yaml": "name: probe\n",
  };

  function run(root) {
    return spawnSync(process.execPath, [GATE, root], { encoding: "utf-8" });
  }

  it("passes a catalog with no key path", () => {
    const result = run(fixture("clean", clean));
    assert.equal(result.status, 0, result.stderr);
  });

  for (const [label, path, content, expected] of [
    [
      "a key read in a skeleton",
      "templates/probe/skeleton/src/providers/anthropic.ts",
      "export const key = process.env.ANTHROPIC_API_KEY;\n",
      "templates/probe/skeleton/src/providers/anthropic.ts:1  key env var  ANTHROPIC_API_KEY",
    ],
    [
      "a key-provider SDK",
      "templates/probe/skeleton/package.json",
      JSON.stringify({ dependencies: { openai: "^6" } }, null, 2),
      "templates/probe/skeleton/package.json:3  key-provider SDK  openai",
    ],
    [
      "a key a composite passes down",
      "composites/probe.yaml",
      "variables:\n  - name: Key\n    default: GROQ_API_KEY\n",
      "composites/probe.yaml:3  key env var  GROQ_API_KEY",
    ],
  ]) {
    it(`fails ${label}, naming the file and line`, () => {
      const result = run(fixture(label.replaceAll(" ", "-"), { ...clean, [path]: content }));
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, new RegExp(expected.replaceAll(".", "\\.")));
    });
  }

  it("reads a skeleton's source and skips build output, dependencies, lockfiles and binaries", () => {
    const key = "export const key = process.env.OPENAI_API_KEY;\n";
    const skipped = [
      "templates/probe/skeleton/node_modules/openai/index.js",
      "templates/probe/skeleton/.git/config",
      "templates/probe/skeleton/dist/index.js",
      "templates/probe/skeleton/build/index.js",
      "templates/probe/skeleton/target/main.js",
      "templates/probe/skeleton/coverage/index.js",
      "templates/probe/skeleton/.turbo/run.log",
      "templates/probe/skeleton/package-lock.json",
      "templates/probe/skeleton/poetry.lock",
      "templates/probe/skeleton/public/icon.png",
    ];
    const root = fixture("skipped", {
      ...clean,
      ...Object.fromEntries(skipped.map((path) => [path, key])),
      "templates/probe/skeleton/data.bin": `\0${key}`,
      "templates/probe/skeleton/src/index.ts": key,
    });

    const { findings } = scan(root);

    assert.deepEqual(
      findings.map((f) => f.path),
      ["templates/probe/skeleton/src/index.ts"],
    );
  });

  it("exits 2 when it reads no file", () => {
    const result = run(fixture("empty", { "README.md": "nothing here\n" }));
    assert.equal(result.status, 2);
  });

  it("finds no key path in the catalog", () => {
    const { files, findings } = scan(ROOT);
    assert.ok(files > 0, "the walk read no file");
    assert.deepEqual(findings, []);
  });
});
