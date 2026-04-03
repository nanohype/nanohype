import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { LlmProvider } from "./types.js";
import type {
  ChatMessage,
  ChatOptions,
  LlmResponse,
  StreamResponse,
  StreamChunk,
  Pricing,
} from "../types.js";
import { getPricing, estimateCost } from "../types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { countTokens } from "../tokens/counter.js";
import { logger } from "../logger.js";

// ── AWS Bedrock Provider ───────────────────────────────────────────
//
// Routes requests to the appropriate model format based on model ID
// prefix. Supports anthropic.* (Claude format) and meta.* (Llama
// format). Uses IAM auth via standard AWS credential chain.
//

const DEFAULT_MODEL = "anthropic.claude-sonnet-4-20250514-v1:0";

/** Determine request body format based on model ID prefix. */
function buildRequestBody(
  modelId: string,
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature: number },
): string {
  const prefix = modelId.split(".")[0];

  if (prefix === "anthropic") {
    const systemParts = messages.filter((m) => m.role === "system");
    const conversationParts = messages.filter((m) => m.role !== "system");
    const systemPrompt = systemParts.map((m) => m.content).join("\n\n");

    return JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: conversationParts.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });
  }

  if (prefix === "meta") {
    const prompt = messages.map((m) => {
      if (m.role === "system") return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n${m.content}<|eot_id|>`;
      if (m.role === "user") return `<|start_header_id|>user<|end_header_id|>\n${m.content}<|eot_id|>`;
      return `<|start_header_id|>assistant<|end_header_id|>\n${m.content}<|eot_id|>`;
    }).join("") + "<|start_header_id|>assistant<|end_header_id|>\n";

    return JSON.stringify({
      prompt,
      max_gen_len: opts.maxTokens,
      temperature: opts.temperature,
    });
  }

  // Fallback: generic body
  return JSON.stringify({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
  });
}

/** Parse response body based on model ID prefix. */
function parseResponseBody(
  modelId: string,
  body: string,
): { text: string; inputTokens: number; outputTokens: number } {
  const parsed = JSON.parse(body);
  const prefix = modelId.split(".")[0];

  if (prefix === "anthropic") {
    const text = parsed.content
      ?.filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("") ?? "";
    return {
      text,
      inputTokens: parsed.usage?.input_tokens ?? 0,
      outputTokens: parsed.usage?.output_tokens ?? 0,
    };
  }

  if (prefix === "meta") {
    return {
      text: parsed.generation ?? "",
      inputTokens: parsed.prompt_token_count ?? 0,
      outputTokens: parsed.generation_token_count ?? 0,
    };
  }

  return {
    text: parsed.text ?? parsed.generation ?? JSON.stringify(parsed),
    inputTokens: 0,
    outputTokens: 0,
  };
}

function createBedrockProvider(): LlmProvider {
  let client: BedrockRuntimeClient | null = null;
  const cb = createCircuitBreaker();

  function getClient(): BedrockRuntimeClient {
    if (!client) {
      client = new BedrockRuntimeClient({
        region: process.env.AWS_REGION ?? "us-east-1",
      });
    }
    return client;
  }

  const pricing: Pricing = getPricing("claude-sonnet-4-20250514");

  return {
    name: "bedrock",
    pricing,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse> {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const temperature = opts?.temperature ?? 1;

      const body = buildRequestBody(model, messages, { maxTokens, temperature });

      const start = performance.now();

      const response = await cb.execute(() =>
        getClient().send(
          new InvokeModelCommand({
            modelId: model,
            body: new TextEncoder().encode(body),
            contentType: "application/json",
            accept: "application/json",
          }),
        ),
      );

      const latencyMs = performance.now() - start;
      const responseBody = new TextDecoder().decode(response.body);
      const { text, inputTokens, outputTokens } = parseResponseBody(model, responseBody);
      const usage = { inputTokens, outputTokens };

      const modelPricing = getPricing(model.replace(/:.*$/, "").replace(/^.*\./, ""));
      const cost = estimateCost(usage, modelPricing);

      logger.debug("bedrock chat complete", { model, ...usage, latencyMs, cost });

      return { text, model, provider: "bedrock", usage, latencyMs, cost };
    },

    streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const temperature = opts?.temperature ?? 1;

      let resolveResponse: (value: LlmResponse) => void;
      const responsePromise = new Promise<LlmResponse>((resolve) => {
        resolveResponse = resolve;
      });

      async function* generate(): AsyncGenerator<StreamChunk> {
        const start = performance.now();
        let fullText = "";

        const body = buildRequestBody(model, messages, { maxTokens, temperature });

        const response = await getClient().send(
          new InvokeModelWithResponseStreamCommand({
            modelId: model,
            body: new TextEncoder().encode(body),
            contentType: "application/json",
            accept: "application/json",
          }),
        );

        if (response.body) {
          for await (const event of response.body) {
            if (event.chunk?.bytes) {
              const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
              let delta = "";

              if (chunk.type === "content_block_delta" && chunk.delta?.text) {
                delta = chunk.delta.text;
              } else if (chunk.generation) {
                delta = chunk.generation;
              }

              if (delta) {
                fullText += delta;
                yield { text: delta, done: false };
              }
            }
          }
        }

        yield { text: "", done: true };

        const latencyMs = performance.now() - start;
        const usage = {
          inputTokens: countTokens(messages.map((m) => m.content).join(" ")),
          outputTokens: countTokens(fullText),
        };
        const modelPricing = getPricing(model.replace(/:.*$/, "").replace(/^.*\./, ""));
        const cost = estimateCost(usage, modelPricing);

        resolveResponse!({
          text: fullText,
          model,
          provider: "bedrock",
          usage,
          latencyMs,
          cost,
        });
      }

      const iterator = generate();

      return {
        [Symbol.asyncIterator]() {
          return iterator;
        },
        response: responsePromise,
      };
    },

    countTokens(text: string, model?: string): number {
      return countTokens(text, model);
    },
  };
}

// Self-register factory
registerProvider("bedrock", createBedrockProvider);
