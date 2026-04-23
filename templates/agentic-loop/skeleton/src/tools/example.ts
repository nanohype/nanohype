import { z } from "zod";
import type { Tool } from "./registry.js";

/**
 * Example tool: a simple calculator that evaluates basic arithmetic.
 *
 * This demonstrates the tool pattern:
 * 1. Define a Zod schema for validated input.
 * 2. Write an async execute function.
 * 3. Export a Tool object.
 * 4. Register it in tools/index.ts.
 */

const inputSchema = z.object({
  expression: z
    .string()
    .describe("A mathematical expression to evaluate, e.g. '2 + 3 * 4'"),
});

async function execute(
  input: z.infer<typeof inputSchema>,
): Promise<string> {
  const { expression } = input;

  const result = evaluateArithmetic(expression);

  if (!Number.isFinite(result)) {
    throw new Error(`Expression did not evaluate to a finite number: ${expression}`);
  }

  return String(result);
}

export const calculatorTool: Tool<typeof inputSchema> = {
  name: "calculator",
  description:
    "Evaluate a basic arithmetic expression. Supports +, -, *, /, parentheses, and decimal numbers.",
  inputSchema,
  execute,
};

/**
 * Evaluate an arithmetic expression using a recursive descent parser.
 *
 * Grammar:
 *   expr   = term (('+' | '-') term)*
 *   term   = factor (('*' | '/') factor)*
 *   factor = number | '(' expr ')' | ('+' | '-') factor
 *
 * Avoids `eval` / `Function` entirely — the parser only understands
 * numbers and the four basic operators, so arbitrary code cannot run
 * even if a caller bypasses upstream validation.
 */
export function evaluateArithmetic(expression: string): number {
  const parser = new ArithmeticParser(expression);
  const value = parser.parseExpression();
  parser.expectEnd();
  return value;
}

class ArithmeticParser {
  private readonly input: string;
  private pos = 0;

  constructor(input: string) {
    this.input = input;
  }

  parseExpression(): number {
    let value = this.parseTerm();
    for (;;) {
      this.skipWhitespace();
      const op = this.peek();
      if (op !== "+" && op !== "-") return value;
      this.pos++;
      const rhs = this.parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    for (;;) {
      this.skipWhitespace();
      const op = this.peek();
      if (op !== "*" && op !== "/") return value;
      this.pos++;
      const rhs = this.parseFactor();
      value = op === "*" ? value * rhs : value / rhs;
    }
  }

  private parseFactor(): number {
    this.skipWhitespace();
    const ch = this.peek();

    if (ch === "+" || ch === "-") {
      this.pos++;
      const value = this.parseFactor();
      return ch === "-" ? -value : value;
    }

    if (ch === "(") {
      this.pos++;
      const value = this.parseExpression();
      this.skipWhitespace();
      if (this.peek() !== ")") {
        throw new Error(`Unmatched '(' at position ${this.pos}`);
      }
      this.pos++;
      return value;
    }

    return this.parseNumber();
  }

  private parseNumber(): number {
    this.skipWhitespace();
    const start = this.pos;
    while (this.pos < this.input.length && /[0-9]/.test(this.input[this.pos]!)) {
      this.pos++;
    }
    if (this.input[this.pos] === ".") {
      this.pos++;
      while (this.pos < this.input.length && /[0-9]/.test(this.input[this.pos]!)) {
        this.pos++;
      }
    }
    if (this.pos === start) {
      throw new Error(`Expected a number at position ${this.pos}`);
    }
    const literal = this.input.slice(start, this.pos);
    const value = Number(literal);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid number literal: "${literal}"`);
    }
    return value;
  }

  expectEnd(): void {
    this.skipWhitespace();
    if (this.pos !== this.input.length) {
      throw new Error(
        `Unexpected character '${this.input[this.pos]}' at position ${this.pos}`,
      );
    }
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && this.input[this.pos] === " ") {
      this.pos++;
    }
  }

  private peek(): string | undefined {
    return this.input[this.pos];
  }
}
