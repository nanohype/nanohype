import { describe, it, expect } from "vitest";
import {
  contains,
  notContains,
  matchesPattern,
  matchesJsonSchema,
  maxTokens,
  satisfies,
} from "../assertions.js";

describe("contains", () => {
  it("passes when the output includes the substring", () => {
    const assert = contains("hello");
    const result = assert("say hello world");
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.message).toContain("contains");
  });

  it("fails when the output does not include the substring", () => {
    const assert = contains("goodbye");
    const result = assert("say hello world");
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.message).toContain("does not contain");
  });
});

describe("notContains", () => {
  it("passes when the output does not include the substring", () => {
    const assert = notContains("secret");
    const result = assert("this is a safe response");
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when the output includes the substring", () => {
    const assert = notContains("password");
    const result = assert("your password is 1234");
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.message).toContain("unexpectedly contains");
  });
});

describe("matchesPattern", () => {
  it("passes when the output matches the regex pattern", () => {
    const assert = matchesPattern("^\\d{3}-\\d{4}$");
    const result = assert("555-1234");
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when the output does not match the regex pattern", () => {
    const assert = matchesPattern("^\\d{3}-\\d{4}$");
    const result = assert("not-a-phone");
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  it("handles complex patterns with groups and alternation", () => {
    const assert = matchesPattern("(yes|no|maybe)");
    const result = assert("The answer is maybe, I think.");
    expect(result.pass).toBe(true);
  });
});

describe("matchesJsonSchema", () => {
  const schema = {
    type: "object",
    required: ["name", "age"],
    properties: {
      name: { type: "string" },
      age: { type: "number" },
      email: { type: "string" },
    },
  };

  it("passes when the output is valid JSON matching the schema", () => {
    const assert = matchesJsonSchema(schema);
    const result = assert(JSON.stringify({ name: "Alice", age: 30 }));
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.message).toBe("Output matches JSON schema");
  });

  it("fails when the output is not valid JSON", () => {
    const assert = matchesJsonSchema(schema);
    const result = assert("this is not json {{{");
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.message).toBe("Output is not valid JSON");
  });

  it("fails when required fields are missing", () => {
    const assert = matchesJsonSchema(schema);
    const result = assert(JSON.stringify({ name: "Alice" }));
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.message).toContain("JSON schema validation failed");
  });

  it("fails when field types are wrong", () => {
    const assert = matchesJsonSchema(schema);
    const result = assert(JSON.stringify({ name: "Alice", age: "thirty" }));
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  it("passes when optional fields are omitted", () => {
    const assert = matchesJsonSchema(schema);
    const result = assert(JSON.stringify({ name: "Bob", age: 25 }));
    expect(result.pass).toBe(true);
  });
});

describe("maxTokens", () => {
  it("passes when the output is within the token limit", () => {
    const assert = maxTokens(10);
    const result = assert("one two three");
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.message).toContain("within token limit");
  });

  it("fails when the output exceeds the token limit", () => {
    const assert = maxTokens(3);
    const result = assert("one two three four five six seven eight");
    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(1);
    expect(result.message).toContain("exceeds token limit");
  });

  it("returns a partial score proportional to how far over the limit", () => {
    const assert = maxTokens(5);
    const result = assert("a b c d e f g h i j");
    expect(result.pass).toBe(false);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });
});

describe("satisfies", () => {
  it("passes when the sync predicate returns true", async () => {
    const assert = satisfies((output) => output.length > 0, "non-empty");
    const result = await assert("hello");
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.message).toContain("satisfies non-empty");
  });

  it("fails when the sync predicate returns false", async () => {
    const assert = satisfies((output) => output.length > 100, "long enough");
    const result = await assert("short");
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.message).toContain("does not satisfy long enough");
  });

  it("works with an async predicate", async () => {
    const assert = satisfies(
      async (output) => {
        await new Promise((r) => setTimeout(r, 1));
        return output.includes("valid");
      },
      "async validator",
    );
    const result = await assert("this is valid output");
    expect(result.pass).toBe(true);
  });

  it("fails with an async predicate that returns false", async () => {
    const assert = satisfies(
      async (output) => {
        await new Promise((r) => setTimeout(r, 1));
        return output.startsWith("OK:");
      },
      "starts with OK",
    );
    const result = await assert("ERROR: something went wrong");
    expect(result.pass).toBe(false);
  });
});
