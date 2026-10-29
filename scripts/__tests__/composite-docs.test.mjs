import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as yaml from "js-yaml";

// A composite that carries `k8s-app-tenant` deploys as a Platform tenant: its
// chart declares the ModelGateway the stack's gateway packages call. The
// composite tables a reader picks a stack from are where that shows, so each
// is held to the manifests: the README table and the composites guide's
// selection guide list every composite once, and a row names the Platform
// tenant chart exactly when its composite carries one. The quick start lists
// a selection, and a row there names the tenant chart on the same terms.

const ROOT = new URL("../..", import.meta.url).pathname;
const COMPOSITES = join(ROOT, "composites");

/** Every composite's name, and whether it carries a `k8s-app-tenant` entry. */
function composites() {
  const out = new Map();
  for (const file of readdirSync(COMPOSITES).sort()) {
    if (!file.endsWith(".yaml")) continue;
    const manifest = yaml.load(readFileSync(join(COMPOSITES, file), "utf8"));
    const tenant = (manifest.templates ?? []).some((entry) => entry.template === "k8s-app-tenant");
    out.set(manifest.name, tenant);
  }
  return out;
}

/**
 * The rows of the first Markdown table after `heading` in `file`, as
 * [composite name, the row's text]. The name is the first cell's link text
 * or code span.
 */
function tableRows(file, heading) {
  const text = readFileSync(join(ROOT, file), "utf8");
  const at = text.indexOf(heading);
  assert.notEqual(at, -1, `${file} has no "${heading}"`);
  const lines = text.slice(at).split("\n");
  const first = lines.findIndex((line) => line.startsWith("|"));
  const rows = [];
  for (const line of lines.slice(first + 2)) {
    if (!line.startsWith("|")) break;
    const cell = line.split("|")[1].trim();
    const name = /^\[([a-z0-9-]+)\]|^`([a-z0-9-]+)`$/.exec(cell);
    assert.ok(name, `${file}: a row whose first cell names no composite: ${line}`);
    rows.push([name[1] ?? name[2], line]);
  }
  assert.ok(rows.length > 0, `${file}: no table rows after "${heading}"`);
  return rows;
}

const TABLES = [
  { file: "README.md", heading: "## Composites", complete: true, says: /Platform tenant chart/ },
  {
    file: "docs/composites-guide.md",
    heading: "## Selection guide",
    complete: true,
    says: /Platform tenant chart/,
  },
  {
    file: "docs/quick-start.md",
    heading: "Available composites:",
    complete: false,
    says: /tenant chart/,
  },
];

describe("composite tables", () => {
  const catalog = composites();

  it("reads a tenant composite and a composite without the chart from the manifests", () => {
    assert.equal(catalog.get("platform-tenant"), true);
    assert.equal(catalog.get("production-api"), false);
  });

  for (const { file, heading, complete, says } of TABLES) {
    it(`${file} lists ${complete ? "every composite once" : "only composites that exist, once each"}`, () => {
      const names = tableRows(file, heading).map(([name]) => name);
      assert.deepEqual(
        names.filter((name, i) => names.indexOf(name) !== i),
        [],
        `${file}: a composite listed twice`,
      );
      assert.deepEqual(
        names.filter((name) => !catalog.has(name)),
        [],
        `${file}: a row for a composite composites/ does not hold`,
      );
      if (complete) {
        assert.deepEqual(
          [...catalog.keys()].filter((name) => !names.includes(name)),
          [],
          `${file}: a composite with no row`,
        );
      }
    });

    it(`${file} names the tenant chart on exactly the composites that carry it`, () => {
      const wrong = tableRows(file, heading)
        .filter(([name, row]) => says.test(row) !== catalog.get(name))
        .map(
          ([name]) =>
            `${name} (${catalog.get(name) ? "carries" : "does not carry"} k8s-app-tenant)`,
        );
      assert.deepEqual(wrong, []);
    });
  }
});
