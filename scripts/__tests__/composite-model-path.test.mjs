import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as yaml from "js-yaml";
import { renderComposite } from "../../sdk/dist/composite.js";
import { LocalSource } from "../../sdk/dist/sources/local.js";

// A gateway provider holds no credential and reaches a model only through
// the Platform's ModelGateway, at the Service the eks-agent-platform operator
// creates for it. A stack whose packages default to that provider therefore
// has a model path only when the stack also declares the ModelGateway, under
// the Platform name the providers were scaffolded with, and hands the app the
// same endpoint; a package that embeds through the gateway also needs the
// gateway's embeddings route. Each package's rendered "Scaffolded with" line
// records the provider it was scaffolded with, so these render every
// composite with its defaults and hold a stack with a package scaffolded on
// the gateway to every gateway endpoint its packages name.

const ROOT = new URL("../..", import.meta.url).pathname;
const source = new LocalSource({ rootDir: ROOT });

const PROBE = {
  ProjectName: "probe-app",
  AppName: "probe-app",
  AppMetric: "probe_app",
  Tenant: "probe-team",
  Image: "probe-image",
  ProductName: "Probe",
};

const GATEWAY_URL =
  /http:\/\/([a-z0-9-]+)-gateway\.tenants-([a-z0-9-]+)\.svc\.cluster\.local:8080/g;

/**
 * A value for each naming variable a composite declares, and for every other
 * required variable it declares with no default; the rest keep their defaults.
 */
function probeValues(manifest) {
  const values = {};
  for (const v of manifest.variables ?? []) {
    if (v.name in PROBE) values[v.name] = PROBE[v.name];
    else if (v.required && v.default === undefined)
      values[v.name] = v.type === "bool" ? false : "probe";
  }
  return values;
}

/** Each rendered package's provider selection, from its "Scaffolded with" line. */
function scaffoldedProviders(files) {
  const out = [];
  for (const file of files) {
    for (const match of file.content.matchAll(/Scaffolded with ([A-Za-z:]+) = (\S+)\./g)) {
      const labels = match[1].split(":");
      const values = match[2].split(":");
      out.push({
        path: file.path,
        selection: Object.fromEntries(labels.map((l, i) => [l, values[i]])),
      });
    }
  }
  return out;
}

/** The ModelGateway CRs and chart gateway endpoints a render declares. */
function declaredGateways(files) {
  const gateways = [];
  const endpoints = new Set();
  for (const file of files) {
    if (!/\.ya?ml$/.test(file.path)) continue;
    let docs;
    try {
      docs = yaml.loadAll(file.content);
    } catch {
      continue;
    }
    for (const doc of docs) {
      if (doc?.kind === "ModelGateway") gateways.push(doc);
      const endpoint = doc?.modelGateway?.endpoint;
      if (doc?.modelGateway?.enabled && typeof endpoint === "string") endpoints.add(endpoint);
    }
  }
  return { gateways, endpoints };
}

const composites = await source.listComposites();

describe("composite model path", () => {
  it("lists the catalog's composites", () => {
    assert.ok(composites.length > 0, "the catalog listed no composite");
  });

  for (const entry of composites) {
    it(`${entry.name}: every gateway its packages call is one the stack declares`, async () => {
      const manifest = await source.fetchComposite(entry.name);
      const result = await renderComposite(manifest, probeValues(manifest), source);
      const failed = (result.warnings ?? []).filter((w) => /Failed to render entry/.test(w));
      assert.deepEqual(failed, [], `${entry.name} rendered partially`);

      const { gateways, endpoints } = declaredGateways(result.files);
      const providers = scaffoldedProviders(result.files);
      const urls = new Set(
        result.files
          .filter((f) => !/\.ya?ml$/.test(f.path))
          .flatMap((f) => [...f.content.matchAll(GATEWAY_URL)].map((m) => m[0])),
      );
      const callsGateway = providers.some(({ selection }) =>
        ["LlmProvider", "DefaultProvider", "EmbeddingProvider"].some(
          (k) => selection[k] === "gateway",
        ),
      );
      if (!callsGateway) return;

      assert.ok(
        gateways.length > 0,
        `${entry.name}: packages call the gateway and the stack declares no ModelGateway`,
      );
      for (const url of urls) {
        const [, service, namespace] = url.match(new RegExp(GATEWAY_URL.source));
        assert.equal(
          service,
          namespace,
          `${entry.name}: ${url} names a Service outside its Platform's namespace`,
        );
        assert.ok(
          gateways.some(
            (g) => g.metadata?.name === service && g.spec?.platformRef?.name === service,
          ),
          `${entry.name}: ${url} has no ModelGateway for Platform ${service}`,
        );
        assert.ok(
          endpoints.has(url),
          `${entry.name}: the chart hands the app no MODEL_GATEWAY_ENDPOINT ${url}`,
        );
      }

      const embeds = providers.filter(({ selection }) => selection.EmbeddingProvider === "gateway");
      for (const { path } of embeds) {
        assert.ok(
          gateways.some((g) => (g.spec?.routes ?? []).some((r) => r.name === "embeddings")),
          `${entry.name}: ${path} embeds through the gateway and the ModelGateway has no embeddings route`,
        );
      }
    });
  }
});
