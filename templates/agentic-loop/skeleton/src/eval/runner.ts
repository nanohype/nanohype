import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runAgent } from "../agent.js";
import type { AssertionResult } from "./assertions.js";
import {
  contains,
  matchesPattern,
  toolWasCalled,
  completedWithinIterations,
} from "./assertions.js";

/**
 * A test fixture defines an input to the agent and a set of
 * assertions to check against the output.
 */
interface Fixture {
  /** Display name for the test case. */
  name: string;

  /** User input to send to the agent. */
  input: string;

  /** Assertions to evaluate. */
  assertions: FixtureAssertion[];
}

interface FixtureAssertion {
  type: "contains" | "matches_pattern" | "tool_was_called" | "max_iterations";
  value: string | number;
}

interface TestResult {
  fixture: string;
  assertions: AssertionResult[];
  error?: string;
}

/**
 * Load all fixture files from the fixtures directory. Each fixture
 * is a JSON file with { name, input, assertions } structure.
 */
async function loadFixtures(fixturesDir: string): Promise<Fixture[]> {
  const entries = await readdir(fixturesDir);
  const jsonFiles = entries.filter((f) => f.endsWith(".json"));

  const fixtures: Fixture[] = [];
  for (const file of jsonFiles) {
    const raw = await readFile(join(fixturesDir, file), "utf-8");
    fixtures.push(JSON.parse(raw) as Fixture);
  }

  return fixtures;
}

/**
 * Run assertions for a single fixture against the agent output.
 */
function checkAssertions(
  fixture: Fixture,
  response: string,
  toolCallLog: string[],
  iterations: number,
): AssertionResult[] {
  const results: AssertionResult[] = [];

  for (const assertion of fixture.assertions) {
    switch (assertion.type) {
      case "contains":
        results.push(contains(response, String(assertion.value)));
        break;
      case "matches_pattern":
        results.push(matchesPattern(response, new RegExp(String(assertion.value))));
        break;
      case "tool_was_called":
        results.push(toolWasCalled(toolCallLog, String(assertion.value)));
        break;
      case "max_iterations":
        results.push(completedWithinIterations(iterations, Number(assertion.value)));
        break;
    }
  }

  return results;
}

/**
 * Main eval runner. Loads fixtures, runs the agent against each one,
 * evaluates assertions, and prints a summary.
 */
async function main(): Promise<void> {
  const fixturesDir = resolve(
    import.meta.dirname ?? new URL(".", import.meta.url).pathname,
    "fixtures",
  );

  const fixtures = await loadFixtures(fixturesDir);

  if (fixtures.length === 0) {
    console.log("No fixtures found in", fixturesDir);
    console.log("Add .json fixture files to get started. Example:");
    console.log(
      JSON.stringify(
        {
          name: "basic math",
          input: "What is 2 + 2?",
          assertions: [
            { type: "contains", value: "4" },
            { type: "tool_was_called", value: "calculator" },
          ],
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Running ${fixtures.length} fixture(s)...\n`);

  const results: TestResult[] = [];

  for (const fixture of fixtures) {
    process.stdout.write(`  ${fixture.name} ... `);

    try {
      const { response, toolCallLog, iterations } = await runAgent(fixture.input);
      const assertions = checkAssertions(fixture, response, toolCallLog, iterations);
      const allPassed = assertions.every((a) => a.pass);

      results.push({ fixture: fixture.name, assertions });
      console.log(allPassed ? "PASS" : "FAIL");

      if (!allPassed) {
        for (const a of assertions) {
          if (!a.pass) {
            console.log(`    FAIL: ${a.message}`);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ fixture: fixture.name, assertions: [], error: message });
      console.log("ERROR");
      console.log(`    ${message}`);
    }
  }

  // Summary
  const totalAssertions = results.reduce((sum, r) => sum + r.assertions.length, 0);
  const passedAssertions = results.reduce(
    (sum, r) => sum + r.assertions.filter((a) => a.pass).length,
    0,
  );
  const failedFixtures = results.filter(
    (r) => r.error || r.assertions.some((a) => !a.pass),
  );

  console.log("\n--- Summary ---");
  console.log(`Fixtures: ${results.length} total, ${results.length - failedFixtures.length} passed, ${failedFixtures.length} failed`);
  console.log(`Assertions: ${totalAssertions} total, ${passedAssertions} passed, ${totalAssertions - passedAssertions} failed`);

  if (failedFixtures.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Eval runner failed:", err);
  process.exit(1);
});
