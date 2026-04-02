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

  // Only allow safe arithmetic characters
  if (!/^[\d+\-*/.() ]+$/.test(expression)) {
    throw new Error(
      "Expression contains invalid characters. Only digits, +, -, *, /, ., (, ) are allowed.",
    );
  }

  // Evaluate the expression safely via Function constructor
  // (restricted to arithmetic by the regex above)
  const result = new Function(`"use strict"; return (${expression});`)() as number;

  if (typeof result !== "number" || !Number.isFinite(result)) {
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
