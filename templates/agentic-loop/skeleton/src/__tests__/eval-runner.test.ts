import { describe, expect, it } from "vitest";
import type { CaseAssertion, EvalCase } from "../eval/cases.js";
import { checkAssertions } from "../eval/runner.js";

/**
 * A case file is JSON, so the assertion union constrains what the loader
 * accepts and nothing else. A type outside it reaches the runner, and a
 * switch that ignores it produces no result — `every` over an empty list is
 * true, so the case is reported green having checked nothing.
 */

function caseWith(assertions: CaseAssertion[]): EvalCase {
  return { name: "a-case", kind: "golden", input: "anything", assertions };
}

const unimplemented = { type: "no_such_assertion", value: "anything" } as unknown as CaseAssertion;

describe("checkAssertions", () => {
  it("fails an assertion type nothing implements", () => {
    const results = checkAssertions(caseWith([unimplemented]), "an unrelated output", [], 1);

    expect(results).toHaveLength(1);
    expect(results[0].pass).toBe(false);
    expect(results[0].message).toContain("no_such_assertion");
  });

  it("does not report a green run for a case built only from unimplemented types", () => {
    const results = checkAssertions(caseWith([unimplemented, unimplemented]), "output", [], 1);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.pass)).toBe(false);
  });

  it("still evaluates the implemented assertions in the same case", () => {
    const results = checkAssertions(
      caseWith([{ type: "contains", value: "needle" }, unimplemented]),
      "a haystack with a needle in it",
      [],
      1,
    );

    expect(results.map((r) => r.pass)).toEqual([true, false]);
  });
});
