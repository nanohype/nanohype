import { describe, expect, it } from "vitest";
import { checkAssertion, checkAssertions } from "../eval/assertions.js";
import type { CaseAssertion, EvalCase } from "../eval/cases.js";

/**
 * A case file is JSON, so the assertion union constrains what the loader
 * accepts and nothing else. A type outside it reaches the checks, and a
 * switch that ignores it produces no result — `every` over an empty list is
 * true, so the case is reported green having checked nothing.
 */

const unimplemented = { type: "no_such_assertion", value: "anything" } as unknown as CaseAssertion;

describe("checkAssertion", () => {
  it("fails an assertion type nothing implements", () => {
    const result = checkAssertion(unimplemented, "an unrelated output");

    expect(result.pass).toBe(false);
    expect(result.message).toContain("no_such_assertion");
  });
});

describe("checkAssertions", () => {
  it("does not report a green run for a case built only from unimplemented types", () => {
    const evalCase: EvalCase = {
      name: "a-case",
      kind: "golden",
      input: "anything",
      assertions: [unimplemented, unimplemented],
    };

    const results = checkAssertions(evalCase, "an unrelated output");

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.pass)).toBe(false);
  });
});
