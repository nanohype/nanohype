import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../ci-eval/config.js";
import { createLogger } from "../ci-eval/logger.js";
import { registerProvider } from "../ci-eval/providers/registry.js";
import { createEvalRunner } from "../ci-eval/runner.js";

// ── Runner execution tests ────────────────────────────────────────
//
// The sibling runner test covers suite discovery. This covers what happens
// once a suite is found: scoring, the per-case failure path, and bounded
// concurrency.
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
        "    input: hello world",
        "    assertions:",
        "      - type: contains",
        "        value: hello",
        "  - name: failing",
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
        "    input: a",
        "    assertions: []",
        "  - name: second",
        "    input: b",
        "    assertions: []",
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

  it("treats a case with no assertions as a pass", async () => {
    registerProvider("quiet", () => ({
      name: "quiet",
      async complete() {
        return "anything";
      },
    }));

    await writeFile(
      join(dir, "suite.yaml"),
      ["cases:", "  - name: smoke", "    input: a", "    assertions: []"].join("\n"),
    );

    const [score] = await createEvalRunner(makeConfig(dir, "quiet"), logger).run();
    // `every` on an empty array is true, so this would pass by accident even
    // if the intent were the opposite — pinned so the intent is recorded.
    expect(score.passed).toBe(1);
    expect(score.cases[0]?.score).toBe(1);
    // No `name:` in the file, so the suite name falls back to the basename.
    expect(score.suite).toBe("suite");
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
      [`  - name: case-${i}`, "    input: x", "    assertions: []"].join("\n"),
    );
    await writeFile(join(dir, "suite.yaml"), ["cases:", ...cases].join("\n"));

    const [score] = await createEvalRunner(makeConfig(dir, "counting", 2), logger).run();

    expect(score.total).toBe(8);
    // The gate is a hand-rolled slot queue rather than a library, so this is
    // the only thing standing between "bounded" and "all eight at once
    // against a rate-limited API".
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("returns no scores when the eval path holds no suites", async () => {
    const scores = await createEvalRunner(makeConfig(dir, "echo"), logger).run();
    expect(scores).toEqual([]);
  });
});
