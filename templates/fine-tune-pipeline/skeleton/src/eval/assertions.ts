/**
 * Checking an eval case against a model output.
 *
 * Each check returns a { pass, message } result instead of throwing, so a
 * run collects the whole corpus rather than stopping at the first case that
 * fails. A failure message carries the case's `why`, because on an
 * adversarial case the value alone does not say what went wrong.
 */

import type { CaseAssertion, EvalCase } from "./cases.js";

/**
 * Outcome of a single assertion.
 */
export interface AssertionResult {
  pass: boolean;
  message: string;
}

function because(assertion: CaseAssertion): string {
  return assertion.why ? ` — ${assertion.why}` : "";
}

/**
 * Apply one assertion to a model output.
 */
export function checkAssertion(assertion: CaseAssertion, output: string): AssertionResult {
  switch (assertion.type) {
    case "contains": {
      const pass = output.includes(assertion.value);
      return {
        pass,
        message: pass
          ? `Contains "${assertion.value}"`
          : `Expected the output to contain "${assertion.value}"${because(assertion)}`,
      };
    }
    case "not_contains": {
      const pass = !output.includes(assertion.value);
      return {
        pass,
        message: pass
          ? `Does not contain "${assertion.value}"`
          : `Expected the output not to contain "${assertion.value}"${because(assertion)}`,
      };
    }
    case "matches_pattern": {
      const pass = new RegExp(assertion.value).test(output);
      return {
        pass,
        message: pass
          ? `Matches /${assertion.value}/`
          : `Expected the output to match /${assertion.value}/${because(assertion)}`,
      };
    }

    default:
      // A case file is JSON and JSON does not honour a union, so a type outside
      // the declared set arrives here at run time. Without this arm it produces
      // no result, and `every` over an empty list is true — the case passes
      // having checked nothing.
      return {
        pass: false,
        message: `Unknown assertion type "${assertion.type}" — nothing checks it`,
      };
  }
}

/**
 * Apply every assertion a case carries. The loader refuses a case with an
 * empty assertion list, so this never returns an empty result set for a
 * case that ran.
 */
export function checkAssertions(evalCase: EvalCase, output: string): AssertionResult[] {
  return evalCase.assertions.map((assertion) => checkAssertion(assertion, output));
}
