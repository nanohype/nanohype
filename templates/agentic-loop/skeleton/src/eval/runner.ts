import { resolve } from "node:path";
import type { AssertionResult } from "./assertions.js";
import {
  completedWithinIterations,
  contains,
  matchesPattern,
  toolWasCalled,
} from "./assertions.js";
import { coversBothKinds, EmptyCorpusError, type EvalCase, loadCases } from "./cases.js";

interface TestResult {
  fixture: string;
  assertions: AssertionResult[];
  error?: string;
}

/**
 * Run assertions for a single fixture against the agent output.
 */
export function checkAssertions(
  fixture: EvalCase,
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
      case "not_contains": {
        const hit = contains(response, String(assertion.value));
        results.push({
          pass: !hit.pass,
          message: hit.pass
            ? `Expected response not to contain "${assertion.value}"${assertion.why ? ` — ${assertion.why}` : ""}`
            : `Does not contain "${assertion.value}"`,
        });
        break;
      }
      case "tool_was_called":
        results.push(toolWasCalled(toolCallLog, String(assertion.value)));
        break;
      case "max_iterations":
        results.push(completedWithinIterations(iterations, Number(assertion.value)));
        break;

      default:
        // A case file is JSON and JSON does not honour a union, so a type outside
        // the declared set arrives here at run time. Without this arm it produces
        // no result, and `every` over an empty list is true — the case passes
        // having checked nothing.
        results.push({
          pass: false,
          message: `Unknown assertion type "${assertion.type}" — nothing checks it`,
        });
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
  const casesDir = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "cases");

  // `loadCases` throws on an empty corpus rather than returning one, so an
  // eval that has nothing to run cannot report the same thing as an eval that
  // ran everything and passed.
  const fixtures = await loadCases(casesDir);

  // The agent module builds a provider client at import, which needs a key.
  // Importing it after the corpus is read means a run with nothing to run says
  // so, instead of failing earlier with a vendor SDK error about credentials.
  const { runAgent } = await import("../agent.js");

  if (!coversBothKinds(fixtures)) {
    console.error(
      "The corpus covers only one kind of case. Golden cases say what the agent does when " +
        "asked nicely; adversarial cases are the ones that find out what it does otherwise.",
    );
    process.exit(1);
  }

  console.log(`Running ${fixtures.length} case(s)...\n`);

  const results: TestResult[] = [];

  for (const fixture of fixtures) {
    process.stdout.write(`  [${fixture.kind}] ${fixture.name} ... `);

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

  const totalAssertions = results.reduce((sum, r) => sum + r.assertions.length, 0);
  const passedAssertions = results.reduce(
    (sum, r) => sum + r.assertions.filter((a) => a.pass).length,
    0,
  );
  const failedFixtures = results.filter((r) => r.error || r.assertions.some((a) => !a.pass));

  console.log("\n--- Summary ---");
  console.log(
    `Cases: ${results.length} total, ${results.length - failedFixtures.length} passed, ${failedFixtures.length} failed`,
  );
  console.log(
    `Assertions: ${totalAssertions} total, ${passedAssertions} passed, ${totalAssertions - passedAssertions} failed`,
  );

  if (failedFixtures.length > 0) {
    process.exit(1);
  }
}

// Guarded so importing this module for `checkAssertions` does not start an
// eval run. A module that executes on import cannot be tested without running
// what it does.
const invokedDirectly = process.argv[1]?.endsWith("runner.ts");
if (invokedDirectly) {
  main().catch((err: unknown) => {
    if (err instanceof EmptyCorpusError) {
      console.error(err.message);
      process.exit(1);
    }
    console.error("Eval runner failed:", err);
    process.exit(1);
  });
}
