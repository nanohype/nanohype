import assert from "node:assert/strict";
import { execFileSync, execFileSync as run } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

// The gate runs the cited suite rather than reading it, so its own proof has
// to run one too. Every case here builds a skeleton, points a comment at a
// suite, and asks the gate what it found — because the defect this replaces is
// exactly a check that agreed with the source and disagreed with the run.

const ROOT = new URL("../..", import.meta.url).pathname;
const GATE = join(ROOT, "scripts", "check-cited-suites.mjs");

// vitest has to be resolvable for the gate to run a suite at all, and a scratch
// skeleton sits outside this repository so Node will not walk up to find it.
// The repository's own modules are linked in instead.
//
// The repository declares vitest for this reason. Borrowing an installed
// skeleton's `node_modules` also works on a machine where somebody has run that
// skeleton's suite, and nowhere else — these cases then fail on a runner with
// nothing to say about the gate they exist to check.
const DONOR = join(ROOT, "node_modules");

function catalog(files) {
  const scratch = mkdtempSync(join(tmpdir(), "cited-"));
  const skeleton = join(scratch, "templates", "example", "skeleton");
  execFileSync("mkdir", ["-p", skeleton]);
  for (const [path, contents] of Object.entries(files)) {
    const full = join(skeleton, path);
    execFileSync("mkdir", ["-p", join(full, "..")]);
    writeFileSync(full, contents);
  }
  writeFileSync(
    join(skeleton, "package.json"),
    JSON.stringify({ name: "example", type: "module", devDependencies: { vitest: "^4.0.0" } }),
  );
  symlinkSync(DONOR, join(skeleton, "node_modules"), "dir");
  return scratch;
}

function gate(root) {
  try {
    return { status: 0, out: run(process.execPath, [GATE, root], { encoding: "utf-8" }) };
  } catch (error) {
    return { status: error.status, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

const CONFIG = (comment, exclude) =>
  'import { defineConfig } from "vitest/config";\n' +
  "export default defineConfig({ test: { coverage: {\n" +
  `${comment}\n` +
  `exclude: ${JSON.stringify(exclude)},\n` +
  "} } });\n";

const SIGNER =
  "export function sign(value: string): string {\n" + '  return "signed:" + value;\n' + "}\n";

describe("check-cited-suites", () => {
  it("fails a suite that imports the excluded file and calls nothing in it", () => {
    // The whole reason this gate runs instead of reading. Every static test of
    // "does the cited suite reach that file" passes on this shape, and the
    // suite covers none of it. The evasion is one line.
    const root = catalog({
      "vitest.config.ts": CONFIG("// covered by the integration suite", ["src/signer.ts"]),
      "src/signer.ts": SIGNER,
      "src/__tests__/integration.test.ts":
        'import { expect, it } from "vitest";\n' +
        'import "../signer.js";\n' +
        'it("runs", () => { expect(1).toBe(1); });\n',
    });
    try {
      const { status, out } = gate(root);
      assert.equal(status, 1, out);
      assert.match(out, /entered no function of/);
      assert.match(out, /src\/signer\.ts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes a suite that calls into the excluded file", () => {
    // The control. Without it a gate that reached nothing at all would report
    // the same failure for every input and look like it was working.
    const root = catalog({
      "vitest.config.ts": CONFIG("// covered by the integration suite", ["src/signer.ts"]),
      "src/signer.ts": SIGNER,
      "src/__tests__/integration.test.ts":
        'import { expect, it } from "vitest";\n' +
        'import { sign } from "../signer.js";\n' +
        'it("signs", () => { expect(sign("a")).toBe("signed:a"); });\n',
    });
    try {
      const { status, out } = gate(root);
      assert.equal(status, 0, out);
      assert.match(out, /enters a function of src\/signer\.ts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails a comment citing a suite the skeleton does not ship", () => {
    const root = catalog({
      "vitest.config.ts": CONFIG("// covered by the integration suite", ["src/signer.ts"]),
      "src/signer.ts": SIGNER,
      "src/__tests__/unit.test.ts":
        'import { expect, it } from "vitest";\nit("runs", () => { expect(1).toBe(1); });\n',
    });
    try {
      const { status, out } = gate(root);
      assert.equal(status, 1, out);
      assert.match(out, /ships no test file/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts a suite named by its directory rather than its filename", () => {
    // The check that shipped matched a basename, failed a genuine suite in an
    // `integration/` directory, and told the author to add the file already
    // sitting there.
    const root = catalog({
      "vitest.config.ts": CONFIG("// covered by the integration suite", ["src/signer.ts"]),
      "src/signer.ts": SIGNER,
      "src/__tests__/integration/signing.test.ts":
        'import { expect, it } from "vitest";\n' +
        'import { sign } from "../../signer.js";\n' +
        'it("signs", () => { expect(sign("a")).toBe("signed:a"); });\n',
    });
    try {
      const { status, out } = gate(root);
      assert.equal(status, 0, out);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("says nothing about a config that cites a suite and excludes nothing", () => {
    // The check that shipped failed this one on the comment alone: a config
    // with no exclusions has no entry for the sentence to be about.
    const root = catalog({
      "vitest.config.ts":
        'import { defineConfig } from "vitest/config";\n' +
        "export default defineConfig({ test: { coverage: {\n" +
        "// this project keeps an integration suite in another package\n" +
        "exclude: [],\n} } });\n",
      "src/signer.ts": SIGNER,
    });
    try {
      const { status, out } = gate(root);
      assert.equal(status, 0, out);
      assert.match(out, /claim corpus is empty/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("attributes a claim to the run it heads, not to the whole array", () => {
    // The entry above the comment is not the comment's to argue for. Reading
    // it as one would fail a config whose first exclusion is hygiene.
    const root = catalog({
      "vitest.config.ts":
        'import { defineConfig } from "vitest/config";\n' +
        "export default defineConfig({ test: { coverage: {\n" +
        "exclude: [\n" +
        '"src/untouched.ts",\n' +
        "// covered by the integration suite\n" +
        '"src/signer.ts",\n' +
        "],\n} } });\n",
      "src/signer.ts": SIGNER,
      "src/untouched.ts": "export function never(): number {\n  return 0;\n}\n",
      "src/__tests__/integration.test.ts":
        'import { expect, it } from "vitest";\n' +
        'import { sign } from "../signer.js";\n' +
        'it("signs", () => { expect(sign("a")).toBe("signed:a"); });\n',
    });
    try {
      const { status, out } = gate(root);
      assert.equal(status, 0, out);
      assert.doesNotMatch(out, /untouched/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits 2 over an empty corpus rather than reporting success", () => {
    const scratch = mkdtempSync(join(tmpdir(), "cited-"));
    execFileSync("mkdir", ["-p", join(scratch, "templates")]);
    try {
      const { status, out } = gate(scratch);
      assert.equal(status, 2);
      assert.match(out, /asserting nothing/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("has the modules the cases link in", () => {
    // These cases are only evidence while the gate can actually run a suite.
    // Without this, missing modules would turn every case above into a gate
    // that could not start, and the failures would read as findings.
    assert.ok(existsSync(DONOR), `${DONOR} is missing — run npm ci at the repository root`);
    assert.ok(existsSync(join(DONOR, "vitest")));
  });
});
