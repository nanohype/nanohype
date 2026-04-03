// ── Module LLM Providers — Main Exports ────────────────────────────
//
// Public API for the LLM providers module. Imports all providers to
// trigger self-registration, then exposes createProviderRegistry as
// the primary entry point.
//

import { validateBootstrap } from "./bootstrap.js";
import { ProviderConfigSchema } from "./config.js";
import { getProvider, listProviders } from "./providers/index.js";
import {
  llmProviderRequestTotal,
  llmProviderDurationMs,
  llmProviderTokenUsage,
} from "./metrics.js";
import type { LlmProvider } from "./providers/types.js";
import type {
  ChatMessage,
  ChatOptions,
  LlmResponse,
  StreamResponse,
  Pricing,
  TokenUsage,
  StreamChunk,
} from "./types.js";
import type { ProviderConfig } from "./config.js";

// Re-export everything consumers need
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export type { LlmProvider, LlmProviderFactory } from "./providers/types.js";
export type {
  ChatMessage,
  ChatOptions,
  LlmResponse,
  StreamResponse,
  StreamChunk,
  Pricing,
  TokenUsage,
} from "./types.js";
export { DEFAULT_PRICING, getPricing, estimateCost } from "./types.js";
export { countTokens } from "./tokens/counter.js";
export { createGatewayAdapter } from "./adapters/gateway.js";
export type { GatewayProviderShape } from "./adapters/gateway.js";
export { normalizeStream, collectStream, fromStringStream } from "./adapters/streaming.js";
export { createCircuitBreaker, CircuitBreakerOpenError } from "./resilience/circuit-breaker.js";
export type { CircuitBreakerOptions } from "./resilience/circuit-breaker.js";
export { ProviderConfigSchema } from "./config.js";
export type { ProviderConfig } from "./config.js";

// ── Provider Registry Facade ───────────────────────────────────────

export interface ProviderRegistry {
  /** Get a provider instance by name. Falls back to default provider. */
  get(name?: string): LlmProvider;

  /** Send a chat request using the default or specified provider. */
  chat(messages: ChatMessage[], opts?: ChatOptions & { provider?: string }): Promise<LlmResponse>;

  /** Stream a chat request using the default or specified provider. */
  streamChat(
    messages: ChatMessage[],
    opts?: ChatOptions & { provider?: string },
  ): StreamResponse;

  /** List all registered provider names. */
  list(): string[];

  /** The resolved configuration. */
  readonly config: ProviderConfig;
}

/**
 * Create a configured provider registry.
 *
 * The registry wraps the low-level provider factories with a
 * high-level API that applies default configuration, records
 * OTel metrics, and provides a convenient chat/streamChat interface.
 *
 * ```typescript
 * const registry = createProviderRegistry({ defaultProvider: "anthropic" });
 * const response = await registry.chat([{ role: "user", content: "Hello" }]);
 * ```
 */
export function createProviderRegistry(
  rawConfig: Partial<ProviderConfig> = {},
): ProviderRegistry {
  const parsed = ProviderConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new Error(`Invalid provider config: ${issues}`);
  }

  validateBootstrap();

  const config = parsed.data;

  function get(name?: string): LlmProvider {
    return getProvider(name ?? config.defaultProvider);
  }

  async function chat(
    messages: ChatMessage[],
    opts?: ChatOptions & { provider?: string },
  ): Promise<LlmResponse> {
    const providerName = opts?.provider ?? config.defaultProvider;
    const provider = getProvider(providerName);

    const mergedOpts: ChatOptions = {
      model: opts?.model ?? config.models?.[providerName],
      maxTokens: opts?.maxTokens ?? config.maxTokens,
      temperature: opts?.temperature ?? config.temperature,
      topP: opts?.topP,
      stop: opts?.stop,
      params: opts?.params,
    };

    const response = await provider.chat(messages, mergedOpts);

    // Record OTel metrics
    llmProviderRequestTotal.add(1, {
      provider: response.provider,
      model: response.model,
    });
    llmProviderDurationMs.record(response.latencyMs, {
      provider: response.provider,
    });
    llmProviderTokenUsage.add(response.usage.inputTokens, {
      provider: response.provider,
      model: response.model,
      direction: "input",
    });
    llmProviderTokenUsage.add(response.usage.outputTokens, {
      provider: response.provider,
      model: response.model,
      direction: "output",
    });

    return response;
  }

  function streamChat(
    messages: ChatMessage[],
    opts?: ChatOptions & { provider?: string },
  ): StreamResponse {
    const providerName = opts?.provider ?? config.defaultProvider;
    const provider = getProvider(providerName);

    const mergedOpts: ChatOptions = {
      model: opts?.model ?? config.models?.[providerName],
      maxTokens: opts?.maxTokens ?? config.maxTokens,
      temperature: opts?.temperature ?? config.temperature,
      topP: opts?.topP,
      stop: opts?.stop,
      params: opts?.params,
    };

    return provider.streamChat(messages, mergedOpts);
  }

  return {
    get,
    chat,
    streamChat,
    list: listProviders,
    config,
  };
}
