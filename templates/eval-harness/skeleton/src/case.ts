import { z } from "zod";

/**
 * Schema for a single assertion defined in a YAML suite file.
 *
 * At least one assertion is required per case (see `EvalCaseSchema`): a case
 * with an empty list passes having checked nothing, which is indistinguishable
 * from a case whose assertions all held.
 */
export const AssertionConfigSchema = z.object({
  type: z.string().min(1),
  /**
   * What the assertion compares against. Required, and required to be
   * something: an assertion with no value checks the output against nothing
   * and reports it as checked, which is the empty-assertion-list defect one
   * level down. `contains` with no value asks whether the output includes
   * `undefined`; `not_contains` with no value asks whether it excludes the
   * string "undefined", and almost every output does.
   */
  value: z
    .unknown()
    .refine((v) => v !== undefined && v !== null, "an assertion needs a value")
    .refine((v) => typeof v !== "string" || v.length > 0, "an assertion value cannot be empty"),
  /**
   * Why this assertion must hold. Load-bearing on an adversarial case, where
   * the assertion is often a refusal and the reason is not readable from the
   * value alone. Reported alongside the failure message.
   */
  why: z.string().optional(),
});

export type AssertionConfig = z.infer<typeof AssertionConfigSchema>;

/**
 * What a case establishes.
 *
 * `golden` is the behaviour the suite exists to deliver. `adversarial` is
 * input trying to make the model do something else — instructions planted in
 * content it was asked to summarise, a demand that it disclose configuration,
 * contradictory instructions, malformed input. The field is required so that
 * adversarial coverage is a claim about the case rather than about its name.
 */
export const EvalCaseKindSchema = z.enum(["golden", "adversarial"]);

export type EvalCaseKind = z.infer<typeof EvalCaseKindSchema>;

/**
 * Schema for a single eval case defined in a YAML suite file.
 */
export const EvalCaseSchema = z.object({
  name: z.string(),
  kind: EvalCaseKindSchema,
  input: z.union([z.string(), z.array(z.string())]),
  expected: z.string().optional(),
  assertions: z.array(AssertionConfigSchema).min(1),
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
  readonly kind: EvalCaseKind;
  readonly input: string | string[];
  readonly expected?: string;
  readonly assertions: AssertionConfig[];
  readonly tags: string[];
  readonly timeout: number;

  constructor(config: EvalCaseConfig) {
    this.name = config.name;
    this.kind = config.kind;
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
