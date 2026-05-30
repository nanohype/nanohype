import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { LlmProvider, ChatMessage } from "./types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { llmRequestsTotal, llmErrorsTotal, llmDuration, recordLlmTokens } from "../metrics.js";

// Bedrock via the Converse API — the org-default LLM path. Auth is the AWS
// credential chain (IRSA on the cluster), never API keys. A cachePoint after
// the system prompt amortizes the (large, stable) prefix across turns — the
// mandated prompt-caching pattern; cache_read/cache_write tokens are metered so
// the hit ratio is observable. Every call has an explicit request timeout, so a
// hung Bedrock socket trips the circuit breaker instead of hanging forever.

const REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 30_000);
const MODEL = process.env.LLM_MODEL ?? "anthropic.claude-sonnet-4-6";

class BedrockProvider implements LlmProvider {
  private readonly client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? "us-west-2",
  });
  private readonly cb = createCircuitBreaker();

  async chat(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    const start = performance.now();
    const labels = { provider: "bedrock", model: MODEL };
    llmRequestsTotal.add(1, labels);
    try {
      const response = await this.cb.execute(() =>
        this.client.send(
          new ConverseCommand({
            modelId: MODEL,
            system: [{ text: systemPrompt }, { cachePoint: { type: "default" } }],
            messages: messages.map((m) => ({
              role: m.role,
              content: [{ text: m.content }],
            })),
            inferenceConfig: { maxTokens: 2048 },
          }),
          // Per-request timeout — a hung Bedrock socket trips the breaker
          // instead of hanging forever.
          { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
        ),
      );

      const usage = response.usage;
      if (usage) {
        recordLlmTokens({
          ...labels,
          input: usage.inputTokens ?? 0,
          output: usage.outputTokens ?? 0,
          cacheRead: usage.cacheReadInputTokens ?? 0,
          cacheWrite: usage.cacheWriteInputTokens ?? 0,
        });
      }

      const blocks = response.output?.message?.content ?? [];
      return blocks
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();
    } catch (err) {
      llmErrorsTotal.add(1, labels);
      throw err;
    } finally {
      llmDuration.record(performance.now() - start, labels);
    }
  }
}

registerProvider("bedrock", () => new BedrockProvider());
