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
      // On overrun, decay the score as limit/count — that hits 0.5 at 2× over,
      // 0.1 at 10× over, and never pins to exactly 0 for any finite overshoot.
      // The previous `1 - (count - limit) / limit` zeroed out at 2× the limit.
      score: pass ? 1 : limit / count,
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
 * Semantic similarity between the output and a reference string using
 * TF-IDF weighted cosine similarity.
 *
 * This is a bag-of-words approximation that works without external embedding
 * APIs. It tokenizes both strings, builds TF-IDF vectors from the combined
 * vocabulary, and computes cosine similarity. For production use with higher
 * accuracy, replace with an embedding provider (e.g. OpenAI text-embedding-3-small
 * or Anthropic Voyage).
 *
 * The `threshold` parameter sets the minimum cosine similarity score (0-1)
 * required to pass.
 */
export function semanticSimilarity(reference: string, threshold = 0.8): AssertionFn {
  return (output: string): AssertionResult => {
    const score = tfidfCosineSimilarity(reference, output);
    const pass = score >= threshold;
    return {
      pass,
      score,
      message: pass
        ? `Semantic similarity ${score.toFixed(3)} >= threshold ${threshold}`
        : `Semantic similarity ${score.toFixed(3)} < threshold ${threshold}`,
    };
  };
}

/**
 * Tokenize a string into lowercase word tokens, splitting on whitespace
 * and punctuation boundaries. Filters out empty strings.
 */
function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter((t) => t.length > 0);
}

/**
 * Compute term frequency map for a list of tokens.
 * Returns a Map of token -> frequency count.
 */
function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  return tf;
}

/**
 * Compute TF-IDF weighted cosine similarity between two strings.
 *
 * Treats the two strings as a two-document corpus for IDF calculation.
 * Each string's TF-IDF vector is computed over the union vocabulary,
 * then cosine similarity is computed between the two vectors.
 */
function tfidfCosineSimilarity(a: string, b: string): number {
  const tokensA = tokenizeText(a);
  const tokensB = tokenizeText(b);

  if (tokensA.length === 0 && tokensB.length === 0) return 1;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const tfA = termFrequency(tokensA);
  const tfB = termFrequency(tokensB);

  // Build vocabulary (union of both token sets)
  const vocab = new Set<string>([...tfA.keys(), ...tfB.keys()]);

  // IDF: log(N / df) where N = 2 (two documents), df = number of docs containing the term
  const idf = new Map<string, number>();
  for (const term of vocab) {
    const df = (tfA.has(term) ? 1 : 0) + (tfB.has(term) ? 1 : 0);
    idf.set(term, Math.log(2 / df));
  }

  // Build TF-IDF vectors and compute cosine similarity in one pass
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const term of vocab) {
    const tfidfA = (tfA.get(term) ?? 0) * (idf.get(term) ?? 0);
    const tfidfB = (tfB.get(term) ?? 0) * (idf.get(term) ?? 0);
    dotProduct += tfidfA * tfidfB;
    normA += tfidfA * tfidfA;
    normB += tfidfB * tfidfB;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
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
