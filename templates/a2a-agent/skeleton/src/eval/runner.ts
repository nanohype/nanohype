import { resolve } from "node:path";
import { listSkills } from "../skills/index.js";
import type { AssertionResult, RoutingOutcome } from "./assertions.js";
import {
  declines,
  notRoutesTo,
  reasoningMatches,
  reasoningNotContains,
  routeIsExecutable,
  routesTo,
} from "./assertions.js";
import { coversBothKinds, EmptyCorpusError, type EvalCase, loadCases } from "./cases.js";

interface CaseResult {
  case: string;
  assertions: AssertionResult[];
}

/** Run the assertions of a single case against the routing outcome. */
export function checkAssertions(
  evalCase: EvalCase,
  outcome: RoutingOutcome,
  registered: string[],
): AssertionResult[] {
  const results: AssertionResult[] = [];

  for (const assertion of evalCase.assertions) {
    let result: AssertionResult;
    switch (assertion.type) {
      case "routes_to":
        result = routesTo(outcome, String(assertion.value));
        break;
      case "not_routes_to":
        result = notRoutesTo(outcome, String(assertion.value));
        break;
      case "declines":
        result = declines(outcome);
        break;
      case "reasoning_matches":
        result = reasoningMatches(outcome, new RegExp(String(assertion.value)));
        break;
      case "reasoning_not_contains":
        result = reasoningNotContains(outcome, String(assertion.value));
        break;
      case "route_is_executable":
        result = routeIsExecutable(outcome, registered);
        break;

      default:
        // A case file is JSON and JSON does not honour a union, so a type outside
        // the declared set arrives here at run time. Without this arm it produces
        // no result, and `every` over an empty list is true — the case passes
        // having checked nothing.
        result = {
          pass: false,
          message: `Unknown assertion type "${assertion.type}" — nothing checks it`,
        };
        break;
    }

    if (!result.pass && assertion.why) {
      result = { pass: false, message: `${result.message} — ${assertion.why}` };
    }
    results.push(result);
  }

  return results;
}

/**
 * Main eval runner. Loads the corpus, routes each case through the agent's
 * router, evaluates assertions, and prints a summary.
 */
async function main(): Promise<void> {
  const casesDir = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "cases");

  // `loadCases` throws on an empty corpus rather than returning one, so an
  // eval that has nothing to run cannot report the same thing as an eval that
  // ran everything and passed.
  const cases = await loadCases(casesDir);

  // Routing reaches a provider SDK, whose client constructs at import and
  // needs a key. Importing it after the corpus is read means a run with
  // nothing to run says so, instead of failing earlier with a vendor SDK
  // error about credentials.
  const { routeTask, RoutingFormatError } = await import("../routing.js");

  if (!coversBothKinds(cases)) {
    console.error(
      "The corpus covers only one kind of case. Golden cases say where a task goes when it " +
        "is asked plainly; adversarial cases are the ones that find out where it goes otherwise.",
    );
    process.exit(1);
  }

  console.log(`Running ${cases.length} case(s)...\n`);

  const registered = listSkills();
  const results: CaseResult[] = [];

  for (const evalCase of cases) {
    process.stdout.write(`  [${evalCase.kind}] ${evalCase.name} ... `);

    let outcome: RoutingOutcome;
    try {
      outcome = { decision: await routeTask(evalCase.input) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcome = {
        decision: null,
        failure: { kind: err instanceof RoutingFormatError ? "format" : "unexpected", message },
      };
    }

    const assertions = checkAssertions(evalCase, outcome, registered);
    const allPassed = assertions.every((a) => a.pass);

    results.push({ case: evalCase.name, assertions });
    console.log(allPassed ? "PASS" : "FAIL");

    if (!allPassed) {
      for (const a of assertions) {
        if (!a.pass) {
          console.log(`    FAIL: ${a.message}`);
        }
      }
    }
  }

  const totalAssertions = results.reduce((sum, r) => sum + r.assertions.length, 0);
  const passedAssertions = results.reduce(
    (sum, r) => sum + r.assertions.filter((a) => a.pass).length,
    0,
  );
  const failedCases = results.filter((r) => r.assertions.some((a) => !a.pass));

  console.log("\n--- Summary ---");
  console.log(
    `Cases: ${results.length} total, ${results.length - failedCases.length} passed, ${failedCases.length} failed`,
  );
  console.log(
    `Assertions: ${totalAssertions} total, ${passedAssertions} passed, ${totalAssertions - passedAssertions} failed`,
  );

  if (failedCases.length > 0) {
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
