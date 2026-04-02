/**
 * Tests for dataset validation.
 *
 * Verifies that the validation module correctly accepts valid training
 * examples, rejects malformed ones, and handles JSONL parsing edge cases.
 */

import { describe, it, expect } from "vitest";
import { validateExample, validateDataset, parseJsonl, validateJsonl } from "../dataset/validate.js";

describe("validateExample", () => {
  it("accepts a valid training example", () => {
    const example = {
      messages: [
        { role: "user", content: "What is 2+2?" },
        { role: "assistant", content: "4" },
      ],
    };
    const result = validateExample(example, 0);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts example with system message", () => {
    const example = {
      messages: [
        { role: "system", content: "You are a math tutor." },
        { role: "user", content: "What is 2+2?" },
        { role: "assistant", content: "4" },
      ],
    };
    const result = validateExample(example, 0);
    expect(result.valid).toBe(true);
  });

  it("rejects example with only user message", () => {
    const example = {
      messages: [{ role: "user", content: "Hello" }],
    };
    const result = validateExample(example, 0);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects example with only assistant message", () => {
    const example = {
      messages: [{ role: "assistant", content: "Hello" }],
    };
    const result = validateExample(example, 0);
    expect(result.valid).toBe(false);
  });

  it("rejects example with empty messages", () => {
    const example = { messages: [] };
    const result = validateExample(example, 0);
    expect(result.valid).toBe(false);
  });

  it("rejects example with empty content", () => {
    const example = {
      messages: [
        { role: "user", content: "" },
        { role: "assistant", content: "answer" },
      ],
    };
    const result = validateExample(example, 0);
    expect(result.valid).toBe(false);
  });

  it("rejects example with invalid role", () => {
    const example = {
      messages: [
        { role: "human", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ],
    };
    const result = validateExample(example, 0);
    expect(result.valid).toBe(false);
  });

  it("rejects non-object input", () => {
    const result = validateExample("not an object", 0);
    expect(result.valid).toBe(false);
  });

  it("includes the correct index in result", () => {
    const example = { messages: [] };
    const result = validateExample(example, 42);
    expect(result.index).toBe(42);
  });
});

describe("validateDataset", () => {
  it("validates multiple examples", () => {
    const examples = [
      {
        messages: [
          { role: "user", content: "Q1" },
          { role: "assistant", content: "A1" },
        ],
      },
      {
        messages: [
          { role: "user", content: "Q2" },
          { role: "assistant", content: "A2" },
        ],
      },
    ];
    const results = validateDataset(examples);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.valid)).toBe(true);
  });

  it("reports mixed valid and invalid", () => {
    const examples = [
      {
        messages: [
          { role: "user", content: "Q" },
          { role: "assistant", content: "A" },
        ],
      },
      { messages: [] },
    ];
    const results = validateDataset(examples);
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
  });
});

describe("parseJsonl", () => {
  it("parses valid JSONL", () => {
    const content = '{"a":1}\n{"b":2}\n';
    const { parsed, errors } = parseJsonl(content);
    expect(parsed).toHaveLength(2);
    expect(errors).toHaveLength(0);
  });

  it("skips empty lines", () => {
    const content = '{"a":1}\n\n{"b":2}\n\n';
    const { parsed, errors } = parseJsonl(content);
    expect(parsed).toHaveLength(2);
    expect(errors).toHaveLength(0);
  });

  it("reports parse errors with line numbers", () => {
    const content = '{"a":1}\nnot json\n{"b":2}\n';
    const { parsed, errors } = parseJsonl(content);
    expect(parsed).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
  });

  it("handles empty input", () => {
    const { parsed, errors } = parseJsonl("");
    expect(parsed).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});

describe("validateJsonl", () => {
  it("validates valid JSONL training data", () => {
    const content = [
      JSON.stringify({
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" },
        ],
      }),
      JSON.stringify({
        messages: [
          { role: "user", content: "Bye" },
          { role: "assistant", content: "Goodbye" },
        ],
      }),
    ].join("\n");

    const { valid, results, parseErrors } = validateJsonl(content);
    expect(valid).toHaveLength(2);
    expect(results.every((r) => r.valid)).toBe(true);
    expect(parseErrors).toHaveLength(0);
  });

  it("filters out invalid examples", () => {
    const content = [
      JSON.stringify({
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" },
        ],
      }),
      JSON.stringify({ messages: [] }),
    ].join("\n");

    const { valid } = validateJsonl(content);
    expect(valid).toHaveLength(1);
  });
});
