import { z } from "zod";

/**
 * Schema for a single assertion defined in a YAML suite file.
 */
export const AssertionConfigSchema = z.object({
  type: z.string(),
  value: z.unknown().optional(),
});

export type AssertionConfig = z.infer<typeof AssertionConfigSchema>;

/**
 * Schema for a single eval case defined in a YAML suite file.
 */
export const EvalCaseSchema = z.object({
  name: z.string(),
  input: z.union([z.string(), z.array(z.string())]),
  expected: z.string().optional(),
  assertions: z.array(AssertionConfigSchema),
  tags: z.array(z.string()).optional(),
  timeout: z.number().positive().optional(),
});

export type EvalCaseConfig = z.infer<typeof EvalCaseSchema>;

/**
 * Represents a single evaluation case with its input, expected output,
 * and a list of assertion configurations to run against the LLM response.
 */
export class EvalCase {
  readonly name: string;
  readonly input: string | string[];
  readonly expected?: string;
  readonly assertions: AssertionConfig[];
  readonly tags: string[];
  readonly timeout: number;

  constructor(config: EvalCaseConfig) {
    this.name = config.name;
    this.input = config.input;
    this.expected = config.expected;
    this.assertions = config.assertions;
    this.tags = config.tags ?? [];
    this.timeout = config.timeout ?? 30_000;
  }

  /**
   * Returns the input as a single string, joining multiple prompts
   * with newlines if the input is an array.
   */
  get prompt(): string {
    return Array.isArray(this.input) ? this.input.join("\n") : this.input;
  }
}
