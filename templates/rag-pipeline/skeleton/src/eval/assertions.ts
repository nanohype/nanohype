/**
 * Checking one assertion against one pipeline answer.
 *
 * Every check returns a { pass, message } result instead of throwing, so a
 * case reports each assertion that failed rather than only the first.
 *
 * Two of the checks look at retrieval rather than at the answer text. An
 * answer that is right because the model already knew it is a passing answer
 * over a pipeline that retrieved nothing, so a case can require that the
 * passage it is about actually reached the prompt.
 */

import type { CaseAssertion } from "./cases.js";

export interface AssertionResult {
  pass: boolean;
  message: string;
}

/** The part of a generation result an assertion is allowed to see. */
export interface EvalOutcome {
  answer: string;
  sources: { source: string }[];
}

function because(why: string | undefined): string {
  return why ? ` — ${why}` : "";
}

/**
 * Apply one assertion.
 *
 * An assertion whose type nothing here implements fails. Passing it would let
 * a typo in a case file report a check that never ran.
 */
export function checkAssertion(assertion: CaseAssertion, outcome: EvalOutcome): AssertionResult {
  const { answer, sources } = outcome;
  const value = assertion.value;

  switch (assertion.type) {
    case "contains": {
      const pass = answer.includes(value);
      return {
        pass,
        message: pass
          ? `Answer contains "${value}"`
          : `Expected the answer to contain "${value}"${because(assertion.why)}`,
      };
    }

    case "not_contains": {
      const pass = !answer.includes(value);
      return {
        pass,
        message: pass
          ? `Answer does not contain "${value}"`
          : `Expected the answer not to contain "${value}"${because(assertion.why)}`,
      };
    }

    case "matches_pattern": {
      // Compiled case-insensitively: a case is about what the answer says, and
      // the model chooses the capitalisation.
      const pattern = new RegExp(value, "i");
      const pass = pattern.test(answer);
      return {
        pass,
        message: pass
          ? `Answer matches /${value}/i`
          : `Expected the answer to match /${value}/i${because(assertion.why)}`,
      };
    }

    case "cites_source": {
      const pass = answer.includes(value);
      return {
        pass,
        message: pass
          ? `Answer cites "${value}"`
          : `Expected the answer to cite "${value}"${because(assertion.why)}`,
      };
    }

    case "retrieved_source": {
      const found = sources.filter((s) => s.source.includes(value));
      return {
        pass: found.length > 0,
        message:
          found.length > 0
            ? `Retrieved "${value}"`
            : `Expected "${value}" among the retrieved passages, got [${sources
                .map((s) => s.source)
                .join(", ")}]${because(assertion.why)}`,
      };
    }

    default:
      return {
        pass: false,
        message: `Unknown assertion type "${String(assertion.type)}"`,
      };
  }
}
