/**
 * Dataset validation.
 *
 * Validates individual training examples and entire datasets against
 * the training example schema. Reports per-example errors with line
 * numbers for easy debugging of malformed JSONL files.
 */

import { trainingExampleSchema, type TrainingExample, type ValidationResult } from "./types.js";

/**
 * Validate a single training example against the schema.
 * Returns a ValidationResult with any errors encountered.
 */
export function validateExample(example: unknown, index: number): ValidationResult {
  const result = trainingExampleSchema.safeParse(example);

  if (result.success) {
    return { valid: true, index, errors: [] };
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );

  return { valid: false, index, errors };
}

/**
 * Validate an entire dataset. Returns validation results for each
 * example, including those that pass. Callers can filter on the
 * `valid` field to find problems.
 */
export function validateDataset(examples: unknown[]): ValidationResult[] {
  return examples.map((example, index) => validateExample(example, index));
}

/**
 * Parse a JSONL string into an array of objects, validating that
 * each line is valid JSON. Returns the parsed objects and any parse
 * errors keyed by line number.
 */
export function parseJsonl(content: string): {
  parsed: unknown[];
  errors: Array<{ line: number; error: string }>;
} {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  const parsed: unknown[] = [];
  const errors: Array<{ line: number; error: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      parsed.push(JSON.parse(lines[i]));
    } catch (err) {
      errors.push({
        line: i + 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { parsed, errors };
}

/**
 * Validate raw JSONL content end-to-end: parse JSON, then validate
 * each parsed object as a training example. Returns valid examples
 * and a combined error report.
 */
export function validateJsonl(content: string): {
  valid: TrainingExample[];
  results: ValidationResult[];
  parseErrors: Array<{ line: number; error: string }>;
} {
  const { parsed, errors: parseErrors } = parseJsonl(content);
  const results = validateDataset(parsed);
  const valid = results
    .filter((r) => r.valid)
    .map((r) => parsed[r.index] as TrainingExample);

  return { valid, results, parseErrors };
}
