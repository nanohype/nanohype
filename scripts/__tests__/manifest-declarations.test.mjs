import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  boolCombinations,
  configurationKeysRead,
  registrationsPerBuild,
  templatesContributingCommands,
} from "../check-manifest-declarations.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;
const TEMPLATES = join(ROOT, "templates");

/**
 * The gate observes behaviour: it renders a build and calls `activate` under a
 * stubbed editor. These pin that it is observing rather than reading — that
 * the registration it sees in a build travels through the module the build
 * actually keeps, and that a build is covered for every combination of the
 * flags that decide which module that is.
 */

/** Every skeleton in the catalog that contributes editor commands. */
function contributingSkeletons() {
  const found = [];
  for (const template of readdirSync(TEMPLATES).sort()) {
    const pkgPath = join(TEMPLATES, template, "skeleton", "package.json");
    try {
      if (!statSync(pkgPath).isFile()) continue;
    } catch {
      continue;
    }
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    if (pkg.contributes?.commands?.length) found.push(template);
  }
  return found;
}

describe("scope", () => {
  it("covers every skeleton in the catalog that contributes commands", () => {
    assert.deepEqual(templatesContributingCommands(), contributingSkeletons());
  });

  it("finds a skeleton contributing commands to prove against", () => {
    // A gate reporting success over nothing reports the same success as one
    // that checked every build.
    assert.ok(
      contributingSkeletons().length > 0,
      "no skeleton contributes commands, so the gate would pass over an empty corpus",
    );
  });

  it("renders one build per combination of a manifest's bool variables", () => {
    assert.deepEqual(boolCombinations({ variables: [] }), [{}]);
    assert.equal(boolCombinations({ variables: [{ name: "A", type: "bool" }] }).length, 2);
    assert.equal(
      boolCombinations({
        variables: [
          { name: "A", type: "bool" },
          { name: "B", type: "bool" },
          { name: "C", type: "string" },
        ],
      }).length,
      4,
    );
  });
});

describe("what a build registers", () => {
  it("observes a registration in every build, not only the one checked in", async () => {
    const builds = await registrationsPerBuild("vscode-ext");

    assert.ok(builds.length > 1, "vscode-ext renders more than one build");
    for (const build of builds) {
      assert.equal(build.error, null, `${JSON.stringify(build.flags)}: ${build.error}`);
      assert.ok(build.contributed.length > 0, "a build contributing no command proves nothing");
      assert.deepEqual(
        build.registered,
        build.contributed,
        `${JSON.stringify(build.flags)} registers ${build.registered} for ${build.contributed}`,
      );
    }
  });

  it("follows the registration into the module the build keeps", async () => {
    // The webview build registers its panel command from `commands/webview`,
    // which the entry point only reaches when both flags are on. Seeing that
    // registration is the difference between running the build and reading the
    // skeleton, where both arms of the conditional are present at once.
    const builds = await registrationsPerBuild("vscode-ext");
    const withPanel = builds.find((b) => b.flags.IncludeWebview && b.flags.IncludeAi);
    const without = builds.find((b) => !b.flags.IncludeWebview && !b.flags.IncludeAi);

    assert.ok(withPanel && without, "both a panel build and a build without one render");
    assert.deepEqual(withPanel.registered, withPanel.contributed);
    assert.deepEqual(without.registered, without.contributed);
  });
});

describe("configurationKeysRead", () => {
  // The receiver's name, the quote style, whether a type argument is written
  // and whether the call is chained are the author's choices and say nothing
  // about what is read. The regex this replaces required a receiver literally
  // named `config`, double quotes and a type argument, in one named file.
  const keys = (source) => [...configurationKeysRead(source, "f.ts")].sort();

  it("reads the shape the skeleton ships", () => {
    assert.deepEqual(
      keys(
        'const config = vscode.workspace.getConfiguration("proj");\nconst p = config.get<string>("provider");',
      ),
      ["proj.provider"],
    );
  });

  it("reads a receiver under any other name", () => {
    assert.deepEqual(
      keys(
        'const settings = vscode.workspace.getConfiguration("proj");\nsettings.get("provider");',
      ),
      ["proj.provider"],
    );
  });

  it("reads single quotes and no type argument", () => {
    assert.deepEqual(
      keys("const c = vscode.workspace.getConfiguration('proj');\nc.get('model');"),
      ["proj.model"],
    );
  });

  it("reads the whole chain written inline", () => {
    assert.deepEqual(keys('vscode.workspace.getConfiguration("proj").get("provider");'), [
      "proj.provider",
    ]);
  });

  it("reads a key opened on no section", () => {
    assert.deepEqual(
      keys('const c = vscode.workspace.getConfiguration();\nc.get("proj.provider");'),
      ["proj.provider"],
    );
  });

  it("reads a binding declared after the call that uses it", () => {
    // Source order is not evaluation order inside a function body, and a
    // single pass would miss this.
    assert.deepEqual(
      keys(
        'function f() {\n  return c.get("provider");\n}\nconst c = vscode.workspace.getConfiguration("proj");',
      ),
      ["proj.provider"],
    );
  });

  it("reads nothing from a `get` on something that is not configuration", () => {
    assert.deepEqual(keys('const map = new Map();\nmap.get("provider");'), []);
    assert.deepEqual(keys('context.globalState.get("provider");'), []);
  });

  it("reads nothing from a key that is not a literal", () => {
    // A computed key is exactly what this cannot see, which is why the gate
    // says so rather than claiming to read every key.
    assert.deepEqual(
      keys('const c = vscode.workspace.getConfiguration("proj");\nc.get(name);'),
      [],
    );
  });
});

describe("what a build declares and reads", () => {
  it("declares exactly the settings each build reads", async () => {
    const builds = await registrationsPerBuild("vscode-ext");
    for (const build of builds) {
      assert.deepEqual(
        build.readSettings,
        build.declaredSettings,
        `${JSON.stringify(build.flags)} reads ${build.readSettings} for ${build.declaredSettings}`,
      );
    }
  });

  it("finds a declared setting to prove against", () => {
    // Without one, "declares exactly what it reads" also holds for a manifest
    // that declares nothing.
    return registrationsPerBuild("vscode-ext").then((builds) => {
      for (const build of builds) {
        assert.ok(build.declaredSettings.length > 0, "a build declaring no setting proves nothing");
      }
    });
  });
});
