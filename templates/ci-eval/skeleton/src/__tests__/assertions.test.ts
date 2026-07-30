import { describe, expect, it } from "vitest";
import { evaluateAssertion, registerAssertion } from "../ci-eval/assertions.js";

// ── Assertion registry tests ──────────────────────────────────────
//
// These are what decides whether an eval case passed, so a broken
// evaluator does not fail loudly — it silently grades every run wrong in
// one direction. Each built-in type is checked on both outcomes, because
// an evaluator stuck on `true` and a correct one are indistinguishable
// from the passing case alone.

describe("evaluateAssertion", () => {
  it("reports an unknown type as a failure rather than throwing", () => {
    // A typo in a YAML suite must fail the case, not crash the runner
    // mid-suite and lose every result after it.
    const r = evaluateAssertion("contians", "x", "x");
    expect(r.pass).toBe(false);
    expect(r.message).toContain("Unknown assertion type");
    expect(r.type).toBe("contians");
  });

  describe("contains", () => {
    it("passes when the substring is present", () => {
      const r = evaluateAssertion("contains", "needle", "a needle in a haystack");
      expect(r.pass).toBe(true);
      expect(r.message).toContain("needle");
    });

    it("fails when it is absent", () => {
      expect(evaluateAssertion("contains", "needle", "just hay").pass).toBe(false);
    });

    it("coerces a non-string value before comparing", () => {
      // Suite files are YAML, so a bare `value: 200` arrives as a number.
      expect(evaluateAssertion("contains", 200, "status 200 ok").pass).toBe(true);
    });
  });

  describe("not-contains", () => {
    it("passes when the substring is absent", () => {
      expect(evaluateAssertion("not-contains", "sorry", "here is the answer").pass).toBe(true);
    });

    it("fails when it is present", () => {
      const r = evaluateAssertion("not-contains", "sorry", "sorry, I cannot help");
      expect(r.pass).toBe(false);
      expect(r.message).toContain("unexpectedly");
    });
  });

  describe("matches-pattern", () => {
    it("passes on a match", () => {
      expect(evaluateAssertion("matches-pattern", "^\\d{3}-\\d{4}$", "555-1234").pass).toBe(true);
    });

    it("fails on no match", () => {
      expect(evaluateAssertion("matches-pattern", "^\\d+$", "abc").pass).toBe(false);
    });

    it("treats the value as a regex, not a literal", () => {
      // `.` matching any character is the difference between this and
      // `contains`; if the pattern were escaped this would fail.
      expect(evaluateAssertion("matches-pattern", "a.c", "abc").pass).toBe(true);
    });
  });

  describe("max-length", () => {
    it("passes at exactly the limit", () => {
      // The boundary is the whole point of the assertion, and `<=` vs `<`
      // is a one-character bug that only this case catches.
      const r = evaluateAssertion("max-length", 5, "12345");
      expect(r.pass).toBe(true);
      expect(r.message).toContain("within limit");
    });

    it("fails one over the limit", () => {
      const r = evaluateAssertion("max-length", 5, "123456");
      expect(r.pass).toBe(false);
      expect(r.message).toContain("exceeds limit");
    });
  });
});

describe("registerAssertion", () => {
  it("makes a custom type dispatchable by name", () => {
    registerAssertion("is-json", (_value, output) => {
      try {
        JSON.parse(output);
        return { type: "is-json", pass: true, message: "Output parsed as JSON" };
      } catch {
        return { type: "is-json", pass: false, message: "Output is not JSON" };
      }
    });

    expect(evaluateAssertion("is-json", null, '{"ok":true}').pass).toBe(true);
    expect(evaluateAssertion("is-json", null, "not json").pass).toBe(false);
  });

  it("lets a later registration replace an earlier one", () => {
    // The registry is a Map, so re-registering overrides. Worth pinning:
    // it is how a project overrides a built-in, and it would equally be
    // how an accidental duplicate silently changes grading.
    registerAssertion("contains-once", () => ({
      type: "contains-once",
      pass: false,
      message: "first",
    }));
    registerAssertion("contains-once", () => ({
      type: "contains-once",
      pass: true,
      message: "second",
    }));
    expect(evaluateAssertion("contains-once", "x", "x").message).toBe("second");
  });
});
