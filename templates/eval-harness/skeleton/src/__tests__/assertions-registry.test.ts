import { describe, expect, it } from "vitest";
import {
  ASSERTION_REGISTRY,
  matchesJsonSchema,
  resolveAssertion,
  satisfies,
  semanticSimilarity,
} from "../assertions.js";

// ── Registry + schema/similarity assertions ───────────────────────
//
// The sibling suite covers the string assertions. These are the three that
// carry real logic — a declarative-schema translator, an async predicate,
// and a TF-IDF similarity score — plus the registry that a YAML suite
// reaches them through.
//
// An assertion is what decides pass or fail, so a broken one does not
// surface as an error; it silently grades every case the same way. Each
// case below asserts both outcomes for that reason.

describe("matchesJsonSchema", () => {
  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
      count: { type: "number" },
      done: { type: "boolean" },
      tags: { type: "array" },
      extra: {},
    },
    required: ["name", "count"],
  };

  it("passes a payload satisfying every declared field", () => {
    const r = matchesJsonSchema(schema)(
      JSON.stringify({ name: "a", count: 1, done: true, tags: [], extra: null }),
    );
    expect(r.pass).toBe(true);
    expect(r.score).toBe(1);
  });

  it("passes when only the required fields are present", () => {
    // Non-required fields become `.optional()`, so omitting them must not
    // fail — this is the branch that distinguishes required from optional.
    expect(matchesJsonSchema(schema)(JSON.stringify({ name: "a", count: 1 })).pass).toBe(true);
  });

  it("fails when a required field is missing", () => {
    const r = matchesJsonSchema(schema)(JSON.stringify({ name: "a" }));
    expect(r.pass).toBe(false);
    expect(r.message).toContain("JSON schema validation failed");
  });

  it("fails when a field has the wrong type", () => {
    expect(matchesJsonSchema(schema)(JSON.stringify({ name: "a", count: "1" })).pass).toBe(false);
  });

  it("reports unparseable output as not-JSON rather than as a schema failure", () => {
    // Two different problems for whoever reads the eval report: the model
    // emitted prose, versus it emitted JSON of the wrong shape.
    const r = matchesJsonSchema(schema)("I cannot do that");
    expect(r.pass).toBe(false);
    expect(r.message).toBe("Output is not valid JSON");
  });

  it("accepts anything when the schema is not an object type", () => {
    // `schema.type !== "object"` falls back to `z.unknown()`, which accepts
    // any parsed value — worth pinning so the permissiveness is deliberate.
    expect(matchesJsonSchema({ type: "array" })("[1,2,3]").pass).toBe(true);
  });
});

describe("satisfies", () => {
  it("passes on a synchronous predicate returning true", async () => {
    const r = await satisfies((o) => o.length > 3, "long enough")("hello");
    expect(r.pass).toBe(true);
    expect(r.score).toBe(1);
  });

  it("awaits an async predicate", async () => {
    const r = await satisfies(async (o) => o.startsWith("{"))('{"a":1}');
    expect(r.pass).toBe(true);
  });

  it("fails and names the label", async () => {
    const r = await satisfies(() => false, "the house rule")("x");
    expect(r.pass).toBe(false);
    expect(r.score).toBe(0);
    expect(r.message).toContain("the house rule");
  });
});

describe("semanticSimilarity", () => {
  it("scores identical text at the top of the range", () => {
    const r = semanticSimilarity("the quick brown fox", 0.9)("the quick brown fox");
    expect(r.pass).toBe(true);
    expect(r.score).toBeGreaterThan(0.99);
  });

  it("scores unrelated text below a default threshold", () => {
    const r = semanticSimilarity("database migration rollback")("a poem about the sea");
    expect(r.pass).toBe(false);
    expect(r.score).toBeLessThan(0.8);
    expect(r.message).toContain("<");
  });

  it("lands partial overlap strictly between the extremes", () => {
    // The distinguishing check. Textbook IDF over a two-document corpus gives a
    // shared term log(2/2) = 0 weight, which zeroes the only signal there is and
    // returns 0 for *every* input — identical strings included. A score that is
    // neither 0 nor 1 is what proves the weighting survived.
    const r = semanticSimilarity("alpha beta", 0.9)("alpha gamma");
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(1);
    expect(r.pass).toBe(false);
  });

  it("is insensitive to case and punctuation", () => {
    // Tokenization lowercases and splits on punctuation, so these should
    // land on the same vectors — if they did not, every real-world output
    // would score lower than it should for reasons unrelated to meaning.
    const r = semanticSimilarity("Deploy the service.", 0.9)("deploy the service");
    expect(r.pass).toBe(true);
  });
});

describe("resolveAssertion", () => {
  it("resolves every type the registry advertises", async () => {
    // The registry keys are the vocabulary a YAML suite is written against,
    // so a key present but unresolvable is a suite that fails at run time
    // with a type error rather than at parse time with a clear message.
    for (const type of Object.keys(ASSERTION_REGISTRY)) {
      const value =
        type === "matchesJsonSchema"
          ? { type: "object", properties: {} }
          : type === "maxTokens"
            ? 100
            : type === "semanticSimilarity"
              ? { reference: "hello" }
              : "hello";
      expect(typeof resolveAssertion(type, value)).toBe("function");
    }
  });

  it("carries the threshold through the semanticSimilarity factory", async () => {
    // The registry unpacks a config object for this one type. A dropped
    // threshold would silently fall back to the 0.8 default, which passes
    // more than the suite asked for.
    const strict = resolveAssertion("semanticSimilarity", {
      reference: "alpha beta",
      threshold: 0.99,
    });
    const r = await strict("alpha gamma");
    expect(r.pass).toBe(false);
  });

  it("throws on an unknown type and lists what is available", () => {
    expect(() => resolveAssertion("doesNotExist", null)).toThrow(/Unknown assertion type/);
    expect(() => resolveAssertion("doesNotExist", null)).toThrow(/contains/);
  });
});
