import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as yaml from "js-yaml";
import { resolveVariables } from "../../sdk/dist/resolver.js";

// The eks-agent-platform operator runs a Platform's ModelGateway as the
// Service `<platform>-gateway` in the namespace `tenants-<platform>`. It
// keeps that namespace name only while it fits a 63-character DNS label; past
// that it truncates the Platform name and appends a hash. A template that
// writes the gateway address from a name variable, as
// `http://__NAME__-gateway.tenants-__NAME__.svc.cluster.local:8080`, names a
// namespace that exists only for a name of at most 55 characters, the longest
// that leaves both `tenants-<name>` and `<name>-gateway` within a label. So
// every such variable refuses a longer name at scaffold time.
//
// The suite finds the variables from the skeletons: any placeholder that
// fills both halves of a gateway address. It fails when it finds none, since
// a skeleton the scan stops matching would otherwise pass every template.

const ROOT = new URL("../..", import.meta.url).pathname;
const TEMPLATES = join(ROOT, "templates");
const GATEWAY_ADDRESS = /(__[A-Z0-9_]+__)-gateway\.tenants-(__[A-Z0-9_]+__)\b/g;

/** The longest name `tenants-` and `-gateway` both extend into a DNS label. */
const LONGEST_NAME = 63 - "tenants-".length;

function* filesUnder(path) {
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (entry !== "node_modules") yield* filesUnder(join(path, entry));
    }
  } else {
    yield path;
  }
}

/** Each template with the variables whose placeholder names a gateway address in its skeleton. */
function gatewayNameVariables() {
  const found = [];
  for (const template of readdirSync(TEMPLATES).sort()) {
    let manifest;
    try {
      manifest = yaml.load(readFileSync(join(TEMPLATES, template, "template.yaml"), "utf-8"));
    } catch {
      continue;
    }
    const placeholders = new Set();
    for (const file of filesUnder(join(TEMPLATES, template, "skeleton"))) {
      for (const [, service, namespace] of readFileSync(file, "utf-8").matchAll(GATEWAY_ADDRESS)) {
        assert.equal(
          service,
          namespace,
          `${file}: a gateway address names Service ${service} in namespace ${namespace}`,
        );
        placeholders.add(service);
      }
    }
    for (const placeholder of placeholders) {
      const variable = (manifest.variables ?? []).find((v) => v.placeholder === placeholder);
      assert.ok(variable, `${template}: ${placeholder} names a gateway address and no variable`);
      found.push({ template, manifest, variable });
    }
  }
  return found;
}

/** Values for every required variable with no default, and `name` for the one under test. */
function valuesWith(manifest, variable, name) {
  const values = {};
  for (const v of manifest.variables ?? []) {
    if (v.required && v.default === undefined) values[v.name] = v.type === "bool" ? false : "probe";
  }
  values[variable.name] = name;
  return values;
}

describe("gateway Service names", () => {
  const found = gatewayNameVariables();

  it("finds a template that writes a gateway address from a name variable", () => {
    assert.ok(found.length > 0, "no skeleton names a gateway address, so nothing below is held");
    assert.ok(
      found.some(({ template }) => template === "k8s-app-tenant"),
      "the k8s-app-tenant chart's gateway endpoint was not found",
    );
  });

  for (const { template, manifest, variable } of found) {
    it(`${template}: ${variable.name} takes a ${LONGEST_NAME}-character name and refuses a longer one`, () => {
      // A single lowercase letter repeated satisfies every naming pattern
      // the variable could also feed, a snake_case metric prefix included.
      const longest = "a".repeat(LONGEST_NAME);
      const resolved = resolveVariables(
        manifest.variables,
        valuesWith(manifest, variable, longest),
      );
      assert.equal(resolved[variable.name], longest);

      assert.throws(
        () => resolveVariables(manifest.variables, valuesWith(manifest, variable, `${longest}a`)),
        new RegExp(`^VariableResolutionError: Variable '${variable.name}' value '${longest}a': `),
        `${template}: ${variable.name} took a ${LONGEST_NAME + 1}-character name, whose namespace the operator hashes`,
      );
    });
  }
});
