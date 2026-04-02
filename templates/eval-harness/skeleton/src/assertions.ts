import { z } from "zod";

/**
 * Result of evaluating a single assertion against an LLM output.
 */
export interface AssertionResult {
  pass: boolean;
  score: number;
  message: string;
}

/**
 * An assertion function takes the LLM output string and returns
 * a result indicating whether the output satisfies the assertion.
 */
export type AssertionFn = (output: string) => AssertionResult | Promise<AssertionResult>;

/**
 * Checks that the output contains the given substring.
 */
export function contains(substring: string): AssertionFn {
  return (output: string): AssertionResult => {
    const pass = output.includes(substring);
    return {
      pass,
      score: pass ? 1 : 0,
      message: pass
        ? `Output contains "${substring}"`
        : `Output does not contain "${substring}"`,
    };
  };
}

/**
 * Checks that the output does NOT contain the given substring.
 */
export function notContains(substring: string): AssertionFn {
  return (output: string): AssertionResult => {
    const pass = !output.includes(substring);
    return {
      pass,
      score: pass ? 1 : 0,
      message: pass
        ? `Output correctly does not contain "${substring}"`
        : `Output unexpectedly contains "${substring}"`,
    };
  };
}

/**
 * Checks that the output matches the given regular expression pattern.
 */
export function matchesPattern(pattern: string): AssertionFn {
  return (output: string): AssertionResult => {
    const regex = new RegExp(pattern);
    const pass = regex.test(output);
    return {
      pass,
      score: pass ? 1 : 0,
      message: pass
        ? `Output matches pattern /${pattern}/`
        : `Output does not match pattern /${pattern}/`,
    };
  };
}

/**
 * Checks that the output is valid JSON conforming to a given JSON-schema-like
 * structure. Uses Zod for runtime validation of the parsed JSON against the
 * declared schema shape.
 *
 * Supports `type`, `required`, and `properties` fields from the schema value.
 */
export function matchesJsonSchema(schema: Record<string, unknown>): AssertionFn {
  return (output: string): AssertionResult => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      return { pass: false, score: 0, message: "Output is not valid JSON" };
    }

    // Build a basic Zod schema from the declarative config
    const zodShape: Record<string, z.ZodTypeAny> = {};
    const properties = (schema.properties ?? {}) as Record<string, { type?: string }>;
    const required = (schema.required ?? []) as string[];

    for (const [key, def] of Object.entries(properties)) {
      let fieldSchema: z.ZodTypeAny;
      switch (def.type) {
        case "string":
          fieldSchema = z.string();
          break;
        case "number":
          fieldSchema = z.number();
          break;
        case "boolean":
          fieldSchema = z.boolean();
          break;
        case "array":
          fieldSchema = z.array(z.unknown());
          break;
        default:
          fieldSchema = z.unknown();
      }
      if (!required.includes(key)) {
        fieldSchema = fieldSchema.optional();
      }
      zodShape[key] = fieldSchema;
    }

    const objectSchema = schema.type === "object" ? z.object(zodShape) : z.unknown();
    const result = objectSchema.safeParse(parsed);

    if (result.success) {
      return { pass: true, score: 1, message: "Output matches JSON schema" };
    }
    return {
      pass: false,
      score: 0,
      message: `JSON schema validation failed: ${result.error.message}`,
    };
  };
}

/**
 * Checks that the output does not exceed the given token count.
 * Uses a simple whitespace-based tokenization as an approximation.
 */
export function maxTokens(limit: number): AssertionFn {
  return (output: string): AssertionResult => {
    // Approximate token count by splitting on whitespace and punctuation boundaries
    const tokens = output.split(/\s+/).filter(Boolean);
    const count = tokens.length;
    const pass = count <= limit;
    return {
      pass,
      score: pass ? 1 : Math.max(0, 1 - (count - limit) / limit),
      message: pass
        ? `Output is within token limit (${count}/${limit})`
        : `Output exceeds token limit (${count}/${limit})`,
    };
  };
}

/**
 * Runs a custom async predicate function against the output.
 * The predicate receives the output string and should return true for pass.
 */
export function satisfies(
  predicate: (output: string) => boolean | Promise<boolean>,
  label = "custom predicate",
): AssertionFn {
  return async (output: string): Promise<AssertionResult> => {
    const pass = await predicate(output);
    return {
      pass,
      score: pass ? 1 : 0,
      message: pass
        ? `Output satisfies ${label}`
        : `Output does not satisfy ${label}`,
    };
  };
}

/**
 * Embedding-based semantic similarity between the output and a reference string.
 *
 * NOTE: This is a stub implementation. To use this assertion in production,
 * integrate an embedding provider (e.g. OpenAI text-embedding-3-small or
 * Anthropic Voyage) and compute cosine similarity between the embeddings
 * of `reference` and the LLM output. The `threshold` parameter sets the
 * minimum cosine similarity score (0-1) required to pass.
 */
export function semanticSimilarity(reference: string, threshold = 0.8): AssertionFn {
  return (_output: string): AssertionResult => {
    // Stub: always returns a warning that this needs a real embedding provider
    console.warn(
      "[semanticSimilarity] Stub implementation — integrate an embedding provider for real similarity scoring",
    );
    return {
      pass: false,
      score: 0,
      message: `semanticSimilarity is a stub. Reference: "${reference.slice(0, 50)}...", threshold: ${threshold}. Integrate an embedding provider to enable this assertion.`,
    };
  };
}

/**
 * Registry mapping assertion type names (as used in YAML suite files)
 * to their factory functions.
 */
export const ASSERTION_REGISTRY: Record<string, (value: unknown) => AssertionFn> = {
  contains: (v) => contains(v as string),
  notContains: (v) => notContains(v as string),
  matchesPattern: (v) => matchesPattern(v as string),
  matchesJsonSchema: (v) => matchesJsonSchema(v as Record<string, unknown>),
  maxTokens: (v) => maxTokens(v as number),
  semanticSimilarity: (v) => {
    const config = v as { reference: string; threshold?: number };
    return semanticSimilarity(config.reference, config.threshold);
  },
};

/**
 * Resolves an assertion config from a YAML suite into a callable assertion function.
 */
export function resolveAssertion(type: string, value: unknown): AssertionFn {
  const factory = ASSERTION_REGISTRY[type];
  if (!factory) {
    throw new Error(`Unknown assertion type: "${type}". Available: ${Object.keys(ASSERTION_REGISTRY).join(", ")}`);
  }
  return factory(value);
}
