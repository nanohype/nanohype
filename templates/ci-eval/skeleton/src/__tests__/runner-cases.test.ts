import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EmptyCorpusError, loadSuites } from "../ci-eval/cases.js";
import type { Config } from "../ci-eval/config.js";
import { createLogger } from "../ci-eval/logger.js";
import { registerProvider } from "../ci-eval/providers/registry.js";
import { createEvalRunner } from "../ci-eval/runner.js";

// ── Runner execution tests ────────────────────────────────────────
//
// The sibling runner test covers which corpora are accepted. This covers
// what happens once one is: scoring, the per-case failure path, and
// bounded concurrency.
//
// A fake provider registered by name is the seam — the registry exists for
// exactly this, so no module mocking is needed and the real scoring,
// assertion dispatch, and concurrency gate all run.

const logger = createLogger("error");

function makeConfig(evalPath: string, provider: string, concurrency = 5): Config {
  return {
    evalPath,
    regressionThreshold: 0.05,
    llmProvider: provider,
    baselinePath: ".eval-baseline.json",
    concurrency,
    logLevel: "error",
  };
}

describe("running a discovered suite", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `ci-eval-run-${process.hrtime.bigint()}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("scores a suite where some assertions fail", async () => {
    registerProvider("echo", () => ({
      name: "echo",
      async complete(prompt: string) {
        return prompt;
      },
    }));

    await writeFile(
      join(dir, "suite.yaml"),
      [
        "name: echo-suite",
        "cases:",
        "  - name: passing",
        "    kind: golden",
        "    input: hello world",
        "    assertions:",
        "      - type: contains",
        "        value: hello",
        "  - name: failing",
        "    kind: adversarial",
        "    input: hello world",
        "    assertions:",
        "      - type: contains",
        "        value: goodbye",
      ].join("\n"),
    );

    const [score] = await createEvalRunner(makeConfig(dir, "echo"), logger).run();

    expect(score.suite).toBe("echo-suite");
    expect(score.total).toBe(2);
    expect(score.passed).toBe(1);
    expect(score.passRate).toBe(0.5);
    // Per-case score is the fraction of assertions that passed, so the
    // suite average is the mean of 1 and 0 — not the same number as the
    // pass rate in general, which is why both are asserted.
    expect(score.averageScore).toBe(0.5);
    expect(score.cases.map((c) => c.name).sort()).toEqual(["failing", "passing"]);
  });

  it("records a provider error as a failed case instead of aborting the suite", async () => {
    registerProvider("explodes", () => ({
      name: "explodes",
      async complete() {
        throw new Error("upstream 503");
      },
    }));

    await writeFile(
      join(dir, "suite.yaml"),
      [
        "name: error-suite",
        "cases:",
        "  - name: first",
        "    kind: golden",
        "    input: a",
        "    assertions:",
        "      - type: contains",
        "        value: a",
        "  - name: second",
        "    kind: adversarial",
        "    input: b",
        "    assertions:",
        "      - type: not-contains",
        "        value: b",
      ].join("\n"),
    );

    const [score] = await createEvalRunner(makeConfig(dir, "explodes"), logger).run();

    // Both cases must be reported. A throw that escaped runCase would lose
    // the second case entirely and the suite would look half its size.
    expect(score.total).toBe(2);
    expect(score.passed).toBe(0);
    expect(score.cases.every((c) => c.error === "upstream 503")).toBe(true);
    expect(score.cases.every((c) => c.score === 0)).toBe(true);
  });

  it("refuses a case with no assertions rather than scoring it a pass", async () => {
    registerProvider("quiet", () => ({
      name: "quiet",
      async complete() {
        return "anything";
      },
    }));

    await writeFile(
      join(dir, "suite.yaml"),
      ["cases:", "  - name: smoke", "    kind: golden", "    input: a", "    assertions: []"].join(
        "\n",
      ),
    );

    // `every` on an empty array is true, so a case with nothing to check is
    // one line away from reporting what a case that checked everything
    // reports. It never reaches the scoring code.
    await expect(createEvalRunner(makeConfig(dir, "quiet"), logger).run()).rejects.toThrow(
      /needs an assertion/,
    );
  });

  it("names a suite after its file when the file does not name it", async () => {
    registerProvider("quiet", () => ({
      name: "quiet",
      async complete() {
        return "anything";
      },
    }));

    await writeFile(
      join(dir, "suite.yaml"),
      [
        "cases:",
        "  - name: smoke",
        "    kind: golden",
        "    input: a",
        "    assertions:",
        "      - type: contains",
        "        value: any",
        "  - name: probe",
        "    kind: adversarial",
        "    input: b",
        "    assertions:",
        "      - type: not-contains",
        "        value: nothing",
      ].join("\n"),
    );

    const [score] = await createEvalRunner(makeConfig(dir, "quiet"), logger).run();

    expect(score.suite).toBe("suite");
    expect(score.passed).toBe(2);
  });

  it("never exceeds the configured concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    registerProvider("counting", () => ({
      name: "counting",
      async complete(prompt: string) {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return prompt;
      },
    }));

    const cases = Array.from({ length: 8 }, (_, i) =>
      [
        `  - name: case-${i}`,
        `    kind: ${i % 2 === 0 ? "golden" : "adversarial"}`,
        "    input: x",
        "    assertions:",
        "      - type: contains",
        "        value: x",
      ].join("\n"),
    );
    await writeFile(join(dir, "suite.yaml"), ["cases:", ...cases].join("\n"));

    const [score] = await createEvalRunner(makeConfig(dir, "counting", 2), logger).run();

    expect(score.total).toBe(8);
    // The gate is a hand-rolled slot queue rather than a library, so this is
    // the only thing standing between "bounded" and "all eight at once
    // against a rate-limited API".
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("refuses an eval path holding no suites rather than scoring nothing", async () => {
    await expect(createEvalRunner(makeConfig(dir, "echo"), logger).run()).rejects.toBeInstanceOf(
      EmptyCorpusError,
    );
  });
});

describe("assertion values", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `ci-eval-values-${process.hrtime.bigint()}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** A suite whose single case carries the given assertion, as YAML. */
  async function suiteWith(assertion: string): Promise<void> {
    await writeFile(
      join(dir, "suite.yaml"),
      `name: s\ncases:\n  - name: c\n    kind: golden\n    input: hello\n    assertions:\n      - ${assertion}\n`,
      "utf-8",
    );
  }

  it("refuses an assertion with no value", async () => {
    await suiteWith("type: contains");

    await expect(loadSuites(dir)).rejects.toThrow(/needs a value/);
  });

  it("refuses a null assertion value", async () => {
    await suiteWith("{ type: contains, value: null }");

    await expect(loadSuites(dir)).rejects.toThrow(/needs a value/);
  });

  it("refuses an empty-string assertion value, which every output contains", async () => {
    await suiteWith('{ type: contains, value: "" }');

    await expect(loadSuites(dir)).rejects.toThrow(/cannot be empty/);
  });

  it("accepts a value that is something", async () => {
    await suiteWith('{ type: contains, value: "hi" }');

    await expect(loadSuites(dir)).resolves.toHaveLength(1);
  });
});
