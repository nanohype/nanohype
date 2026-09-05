import { resolve } from "path";
import type { QueryResult } from "../operations/types.js";
import {
  type CaseAssertion,
  coversBothKinds,
  EmptyCorpusError,
  type EvalCase,
  loadCases,
} from "./cases.js";

interface AssertionResult {
  pass: boolean;
  message: string;
}

interface CaseResult {
  name: string;
  assertions: AssertionResult[];
  error?: string;
}

function because(assertion: CaseAssertion): string {
  return assertion.why ? ` — ${assertion.why}` : "";
}

/**
 * Apply one assertion to a query result.
 *
 * An unrecognised type fails rather than being skipped: the case schema fixes
 * the shape of an assertion and leaves the vocabulary to each runner, so a
 * typo here would otherwise be a case that passes having checked nothing.
 */
export function check(assertion: CaseAssertion, result: QueryResult): AssertionResult {
  const answer = result.answer;

  switch (assertion.type) {
    case "contains":
      return {
        pass: answer.includes(assertion.value),
        message: `answer contains "${assertion.value}"${because(assertion)}`,
      };
    case "not_contains":
      return {
        pass: !answer.includes(assertion.value),
        message: `answer does not contain "${assertion.value}"${because(assertion)}`,
      };
    case "matches_pattern":
      return {
        pass: new RegExp(assertion.value).test(answer),
        message: `answer matches /${assertion.value}/${because(assertion)}`,
      };
    case "cites_page":
      return {
        pass: result.citations.some((c) => c.page.includes(assertion.value)),
        message: `cites ${assertion.value}${because(assertion)} (cited: [${result.citations
          .map((c) => c.page)
          .join(", ")}])`,
      };
    default:
      return {
        pass: false,
        message: `unknown assertion type "${assertion.type}"`,
      };
  }
}

function checkCase(evalCase: EvalCase, result: QueryResult): AssertionResult[] {
  return evalCase.assertions.map((assertion) => check(assertion, result));
}

async function main(): Promise<void> {
  const here = import.meta.dirname;

  // `loadCases` throws on an empty corpus rather than returning one, so an
  // eval that has nothing to run cannot report the same thing as an eval that
  // ran everything and passed.
  const cases = await loadCases(resolve(here, "cases"));

  if (!coversBothKinds(cases)) {
    console.error(
      "The corpus covers only one kind of case. Golden cases say what the wiki answers when " +
        "asked plainly; adversarial cases are the ones that find out what it answers otherwise.",
    );
    process.exit(1);
  }

  // The query pipeline resolves providers from configuration and builds a
  // client for the configured model. Reaching it only after the corpus is
  // known to hold something means a run with nothing to run says so, instead
  // of failing earlier with a vendor SDK error about credentials.
  const { FIXTURE_PROVIDER, FIXTURE_TENANT, registerFixtureWiki } = await import(
    "./fixture-storage.js"
  );
  const pages = await registerFixtureWiki(resolve(here, "fixtures"));
  process.env["WIKI_STORAGE_PROVIDER"] = FIXTURE_PROVIDER;

  const { query } = await import("../operations/query.js");

  console.log(`Asking ${cases.length} case(s) of a wiki holding: ${pages.join(", ")}\n`);

  const results: CaseResult[] = [];

  for (const evalCase of cases) {
    process.stdout.write(`  [${evalCase.kind}] ${evalCase.name} ... `);

    try {
      const result = await query(FIXTURE_TENANT, evalCase.input);
      const assertions = checkCase(evalCase, result);
      const passed = assertions.every((a) => a.pass);

      results.push({ name: evalCase.name, assertions });
      console.log(passed ? "PASS" : "FAIL");

      for (const a of assertions) {
        if (!a.pass) console.log(`    FAIL: ${a.message}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name: evalCase.name, assertions: [], error: message });
      console.log("ERROR");
      console.log(`    ${message}`);
    }
  }

  const totalAssertions = results.reduce((sum, r) => sum + r.assertions.length, 0);
  const passedAssertions = results.reduce(
    (sum, r) => sum + r.assertions.filter((a) => a.pass).length,
    0,
  );
  const failed = results.filter((r) => r.error || r.assertions.some((a) => !a.pass));

  console.log("\n--- Summary ---");
  console.log(
    `Cases: ${results.length} total, ${results.length - failed.length} passed, ${failed.length} failed`,
  );
  console.log(
    `Assertions: ${totalAssertions} total, ${passedAssertions} passed, ${totalAssertions - passedAssertions} failed`,
  );

  if (failed.length > 0) {
    process.exit(1);
  }
}

// Guarded so importing this module for `check` does not start an eval run. A
// module that executes on import cannot be tested without running what it does.
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
