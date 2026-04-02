import { createHash } from "node:crypto";
import type { LlmProvider, ChatMessage } from "./types.js";
import { registerProvider } from "./registry.js";

// ── Mock LLM Provider for Eval Harness ────────────────────────────
//
// Returns deterministic responses keyed by the first 50 characters of
// the last user message. The same input always produces the same
// output, which is critical for eval reproducibility. No external API
// calls — runs entirely offline.
//

function inputKey(messages: ChatMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = lastUser?.content ?? "";
  const prefix = text.slice(0, 50);
  return createHash("sha256").update(prefix).digest("hex").slice(0, 16);
}

/**
 * Build a deterministic response from the hash key. Uses the hash
 * digits to vary the response content while remaining fully
 * reproducible across runs. Pure computation — no caching needed.
 */
function generateDeterministicResponse(key: string): string {
  const variant = parseInt(key.slice(0, 2), 16) % 5;
  const responses = [
    "The analysis indicates a positive correlation between the input variables. The primary factor is data consistency, followed by normalization quality. Confidence: 0.87.",
    "After evaluating the constraints, the optimal solution involves a two-phase approach: first validate all inputs against the schema, then apply the transformation pipeline. Expected accuracy: 92%.",
    "The classification result is Category B with high confidence. Supporting evidence includes pattern matching on three out of four key features, with the fourth showing marginal alignment.",
    "Summary: The input describes a process with 4 sequential steps. Each step has clear preconditions and postconditions. The overall workflow is deterministic and can be verified through unit testing.",
    "The answer is: structured output with three key components — (1) the primary result derived from direct analysis, (2) supporting context from related data points, and (3) confidence metrics for each conclusion.",
  ];
  return responses[variant];
}

class MockEvalProvider implements LlmProvider {
  async complete(messages: ChatMessage[]): Promise<string> {
    return generateDeterministicResponse(inputKey(messages));
  }
}

registerProvider("mock", () => new MockEvalProvider());
