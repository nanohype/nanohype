import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { readRequestTimeoutMs } from "../config.js";
import { llmDuration, llmErrorsTotal, llmRequestsTotal, recordLlmTokens } from "../metrics.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { registerProvider } from "./registry.js";
import type { ChatMessage, LlmProvider } from "./types.js";

// Bedrock via the Converse API, called directly. Auth is the AWS credential
// chain, never API keys, so it serves the bot off the nanohype substrate: an
// ECS task role, or a local AWS profile. On the substrate the gateway provider
// is the path to a model: a direct call skips the route's guardrail and rate
// limit. A cachePoint after the system prompt amortizes the (large, stable)
// prefix across turns — the mandated prompt-caching pattern;
// cache_read/cache_write tokens are metered so the hit ratio is observable.
// Every call has an explicit request timeout, so a hung Bedrock socket trips
// the circuit breaker instead of hanging forever.

const REQUEST_TIMEOUT_MS = readRequestTimeoutMs();
const MODEL = process.env.LLM_MODEL ?? "us.anthropic.claude-sonnet-5";

class BedrockProvider implements LlmProvider {
  private readonly client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? "us-east-1",
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
      // performance.now() is milliseconds; the histogram is in seconds.
      llmDuration.record((performance.now() - start) / 1000, labels);
    }
  }
}

registerProvider("bedrock", () => new BedrockProvider());
