import { describe, expect, it } from "vitest";
import { EvalCase, EvalCaseSchema } from "../case.js";
import type { ChatMessage, LlmProvider } from "../providers/types.js";
import { EvalSuite } from "../suite.js";

/**
 * Creates a mock provider that returns predetermined responses
 * keyed by the user prompt content.
 */
function createMockProvider(responses: Record<string, string>): LlmProvider {
  return {
    async complete(messages: ChatMessage[]): Promise<string> {
      const userMessage = messages.find((m) => m.role === "user");
      const prompt = userMessage?.content ?? "";
      const response = responses[prompt];
      if (response === undefined) {
        throw new Error(`No mock response configured for prompt: "${prompt}"`);
      }
      return response;
    },
  };
}

describe("EvalSuite", () => {
  it("runs all cases and reports pass/fail counts", async () => {
    const cases = [
      new EvalCase({
        name: "greeting-check",
        kind: "golden",
        input: "Say hello",
        assertions: [
          { type: "contains", value: "hello" },
          { type: "notContains", value: "goodbye" },
        ],
      }),
      new EvalCase({
        name: "json-output",
        kind: "golden",
        input: "Return JSON",
        assertions: [
          {
            type: "matchesJsonSchema",
            value: {
              type: "object",
              required: ["status"],
              properties: { status: { type: "string" } },
            },
          },
        ],
      }),
    ];

    const provider = createMockProvider({
      "Say hello": "hello world",
      "Return JSON": '{"status": "ok"}',
    });

    const suite = new EvalSuite("test-suite", cases, "Integration test suite");
    const result = await suite.run(provider);

    expect(result.name).toBe("test-suite");
    expect(result.description).toBe("Integration test suite");
    expect(result.cases).toHaveLength(2);
    expect(result.cases.every((c) => c.pass)).toBe(true);
    expect(result.passRate).toBe(1);
    expect(result.averageScore).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("reports failures when assertions do not pass", async () => {
    const cases = [
      new EvalCase({
        name: "should-fail",
        kind: "golden",
        input: "Give me a number",
        assertions: [{ type: "contains", value: "42" }],
      }),
      new EvalCase({
        name: "should-pass",
        kind: "golden",
        input: "Say yes",
        assertions: [{ type: "contains", value: "yes" }],
      }),
    ];

    const provider = createMockProvider({
      "Give me a number": "The answer is 7",
      "Say yes": "yes indeed",
    });

    const suite = new EvalSuite("mixed-results", cases);
    const result = await suite.run(provider);

    expect(result.cases).toHaveLength(2);

    const failed = result.cases.find((c) => c.name === "should-fail");
    const passed = result.cases.find((c) => c.name === "should-pass");

    expect(failed?.pass).toBe(false);
    expect(failed?.score).toBe(0);
    expect(passed?.pass).toBe(true);
    expect(passed?.score).toBe(1);

    expect(result.passRate).toBe(0.5);
    expect(result.averageScore).toBe(0.5);
  });

  it("records the output from the provider in each case result", async () => {
    const cases = [
      new EvalCase({
        name: "capture-output",
        kind: "golden",
        input: "Echo this",
        assertions: [{ type: "contains", value: "echo" }],
      }),
    ];

    const provider = createMockProvider({
      "Echo this": "I will echo your request",
    });

    const suite = new EvalSuite("output-capture", cases);
    const result = await suite.run(provider);

    expect(result.cases[0].output).toBe("I will echo your request");
  });

  it("handles provider errors gracefully", async () => {
    const cases = [
      new EvalCase({
        name: "error-case",
        kind: "golden",
        input: "Trigger error",
        assertions: [{ type: "contains", value: "anything" }],
      }),
    ];

    const provider: LlmProvider = {
      async complete(): Promise<string> {
        throw new Error("API rate limit exceeded");
      },
    };

    const suite = new EvalSuite("error-suite", cases);
    const result = await suite.run(provider);

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].pass).toBe(false);
    expect(result.cases[0].error).toBe("API rate limit exceeded");
    expect(result.passRate).toBe(0);
  });

  it("reports why a failing assertion was written down", async () => {
    const cases = [
      new EvalCase({
        name: "keeps-the-task",
        kind: "adversarial",
        input: "Summarise the note",
        assertions: [
          {
            type: "notContains",
            value: "INJECTION-ACCEPTED",
            why: "the token the planted instruction asks for",
          },
        ],
      }),
    ];

    const provider = createMockProvider({
      "Summarise the note": "INJECTION-ACCEPTED",
    });

    const suite = new EvalSuite("why-suite", cases);
    const result = await suite.run(provider);

    expect(result.cases[0].pass).toBe(false);
    expect(result.cases[0].assertions[0].message).toContain("the token the planted instruction");
  });

  it("computes scores correctly with multiple assertions per case", async () => {
    const cases = [
      new EvalCase({
        name: "multi-assert",
        kind: "golden",
        input: "Respond politely",
        assertions: [
          { type: "contains", value: "please" },
          { type: "notContains", value: "rude" },
          { type: "maxTokens", value: 20 },
        ],
      }),
    ];

    const provider = createMockProvider({
      "Respond politely": "Could you please help me with this task?",
    });

    const suite = new EvalSuite("multi-assert-suite", cases);
    const result = await suite.run(provider);

    expect(result.cases[0].assertions).toHaveLength(3);
    expect(result.cases[0].assertions[0].pass).toBe(true); // contains "please"
    expect(result.cases[0].assertions[1].pass).toBe(true); // notContains "rude"
    expect(result.cases[0].assertions[2].pass).toBe(true); // maxTokens 20
    expect(result.cases[0].pass).toBe(true);
    expect(result.cases[0].score).toBe(1);
  });
});

describe("assertion values", () => {
  const withAssertion = (assertion: unknown) => ({
    name: "a case",
    kind: "golden",
    input: "hello",
    assertions: [assertion],
  });

  it("refuses an assertion with no value, which compares the output against nothing", () => {
    // `contains` with no value asks whether the output includes `undefined`.
    // `not_contains` with no value asks whether it excludes the string
    // "undefined", which almost every output does. Either way the case
    // reports a check it did not make.
    const parsed = EvalCaseSchema.safeParse(withAssertion({ type: "contains" }));

    expect(parsed.success).toBe(false);
  });

  it("refuses a null assertion value", () => {
    const parsed = EvalCaseSchema.safeParse(withAssertion({ type: "contains", value: null }));

    expect(parsed.success).toBe(false);
  });

  it("refuses an empty-string assertion value, which every output contains", () => {
    const parsed = EvalCaseSchema.safeParse(withAssertion({ type: "contains", value: "" }));

    expect(parsed.success).toBe(false);
  });

  it("refuses an assertion with no type", () => {
    const parsed = EvalCaseSchema.safeParse(withAssertion({ value: "hi" }));

    expect(parsed.success).toBe(false);
  });

  it("accepts an assertion carrying a value", () => {
    const parsed = EvalCaseSchema.safeParse(withAssertion({ type: "contains", value: "hi" }));

    expect(parsed.success).toBe(true);
  });

  it("accepts a non-string value, since an assertion type decides its shape", () => {
    const parsed = EvalCaseSchema.safeParse(withAssertion({ type: "maxTokens", value: 10 }));

    expect(parsed.success).toBe(true);
  });
});
