import { describe, it, expect } from "vitest";
import { evaluateArithmetic, calculatorTool } from "../tools/example.js";

describe("evaluateArithmetic", () => {
  it("evaluates simple addition", () => {
    expect(evaluateArithmetic("2 + 3")).toBe(5);
  });

  it("evaluates simple subtraction", () => {
    expect(evaluateArithmetic("10 - 4")).toBe(6);
  });

  it("evaluates simple multiplication", () => {
    expect(evaluateArithmetic("6 * 7")).toBe(42);
  });

  it("evaluates simple division", () => {
    expect(evaluateArithmetic("20 / 4")).toBe(5);
  });

  it("respects operator precedence", () => {
    expect(evaluateArithmetic("2 + 3 * 4")).toBe(14);
    expect(evaluateArithmetic("10 - 6 / 2")).toBe(7);
  });

  it("evaluates parenthesized sub-expressions", () => {
    expect(evaluateArithmetic("(2 + 3) * 4")).toBe(20);
    expect(evaluateArithmetic("2 * (3 + (4 - 1))")).toBe(12);
  });

  it("handles unary minus and plus", () => {
    expect(evaluateArithmetic("-5")).toBe(-5);
    expect(evaluateArithmetic("+5")).toBe(5);
    expect(evaluateArithmetic("3 + -2")).toBe(1);
    expect(evaluateArithmetic("-(2 + 3)")).toBe(-5);
  });

  it("handles decimal numbers", () => {
    expect(evaluateArithmetic("1.5 + 2.25")).toBe(3.75);
    expect(evaluateArithmetic("0.1 * 10")).toBeCloseTo(1);
  });

  it("ignores whitespace", () => {
    expect(evaluateArithmetic("   2   +   3   ")).toBe(5);
  });

  it("produces Infinity for division by zero", () => {
    expect(evaluateArithmetic("1 / 0")).toBe(Infinity);
  });

  it("rejects unmatched parentheses", () => {
    expect(() => evaluateArithmetic("(1 + 2")).toThrow(/Unmatched/);
  });

  it("rejects trailing garbage", () => {
    expect(() => evaluateArithmetic("1 + 2 x")).toThrow(/Unexpected character/);
  });

  it("rejects empty expressions", () => {
    expect(() => evaluateArithmetic("")).toThrow(/Expected a number/);
  });

  it("rejects identifiers — no access to globals", () => {
    expect(() => evaluateArithmetic("process")).toThrow();
    expect(() => evaluateArithmetic("globalThis")).toThrow();
  });
});

describe("calculatorTool", () => {
  it("returns the computed result as a string", async () => {
    const result = await calculatorTool.execute({ expression: "(2 + 3) * 4" });
    expect(result).toBe("20");
  });

  it("throws on non-finite results", async () => {
    await expect(
      calculatorTool.execute({ expression: "0 / 0" }),
    ).rejects.toThrow(/did not evaluate to a finite number/);
  });

  it("rejects malformed expressions", async () => {
    await expect(
      calculatorTool.execute({ expression: "1 +" }),
    ).rejects.toThrow();
  });
});
