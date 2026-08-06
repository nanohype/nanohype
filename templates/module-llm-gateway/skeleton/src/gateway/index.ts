// ── LLM Gateway — Main Exports ──────────────────────────────────────
//
// Public API for the LLM gateway module. Imports providers, routing
// strategies, and caching strategies so they self-register, then
// exposes createGateway as the primary entry point.
//

import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import { computeCacheKey } from "./caching/hash.js";
import { getCachingStrategy } from "./caching/index.js";
import type { CostFilters, CostSummary } from "./cost/tracker.js";
import { createCostTracker } from "./cost/tracker.js";
import {
  bedrockCacheTotal,
  gatewayCacheTotal,
  gatewayCostTotal,
  gatewayRequestDuration,
  gatewayRequestTotal,
  gatewayTokenUsage,
} from "./metrics.js";
import { bedrockCacheKinds } from "./providers/bedrock-cache.js";
import { getProvider } from "./providers/index.js";
import type { GatewayProvider } from "./providers/types.js";
import { getStrategy } from "./routing/index.js";
import type { ChatMessage, ChatOptions, GatewayConfig, GatewayResponse } from "./types.js";

export {
  getCachingStrategy,
  listCachingStrategies,
  registerCachingStrategy,
} from "./caching/index.js";
export type { CacheContext, CachedResponse, CachingStrategy } from "./caching/types.js";
export type { AnomalyResult } from "./cost/anomaly.js";
export { detectAnomalies } from "./cost/anomaly.js";
export { calculateCost, DEFAULT_PRICING, getModelPricing } from "./cost/pricing.js";
export type { CostEntry, CostFilters, CostSummary, CostTracker } from "./cost/tracker.js";
export { createCostTracker } from "./cost/tracker.js";
// Re-export everything consumers need
export { getProvider, listProviders, registerProvider } from "./providers/index.js";
export type { GatewayProvider, ProviderPricing } from "./providers/types.js";
export { getStrategy, listStrategies, registerStrategy } from "./routing/index.js";
export type { RoutingContext, RoutingStrategy } from "./routing/types.js";
export { countTokens } from "./tokens/counter.js";
export type {
  ChatMessage,
  ChatOptions,
  GatewayConfig,
  GatewayResponse,
} from "./types.js";

// ── Gateway Facade ──────────────────────────────────────────────────

export interface Gateway {
  /** Send a chat request through the gateway. */
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<GatewayResponse>;

  /** Query aggregated cost data. */
  getCosts(filters?: CostFilters): CostSummary;

  /** Shut down the gateway and release resources. */
  close(): Promise<void>;
}

/** Zod schema for validating createGateway arguments. */
const CreateGatewaySchema = z.object({
  providers: z.array(z.string().min(1)).min(1, "At least one provider is required"),
  routingStrategy: z.string().optional(),
  cachingStrategy: z.string().optional(),
  models: z.record(z.string(), z.string()).optional(),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

/**
 * Create a configured gateway instance.
 *
 * The gateway initializes provider, routing, and caching registries
 * from the provided configuration. All providers must be registered
 * (built-in providers self-register on import via their barrels).
 *
 *   const gateway = createGateway({
 *     providers: ["anthropic", "openai"],
 *     routingStrategy: "adaptive",
 *     cachingStrategy: "hash",
 *   });
 *
 *   const response = await gateway.chat([
 *     { role: "user", content: "Hello!" },
 *   ]);
 */
export function createGateway(config: GatewayConfig): Gateway {
  const parsed = CreateGatewaySchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid gateway config: ${issues}`);
  }

  validateBootstrap();

  // Resolve providers
  const providers: GatewayProvider[] = config.providers.map((name) => getProvider(name));

  // Resolve strategies — each call returns a fresh instance with its own state
  const routingStrategyName = config.routingStrategy ?? "static";
  const cachingStrategyName = config.cachingStrategy ?? "hash";
  const routing = getStrategy(routingStrategyName);
  const caching = getCachingStrategy(cachingStrategyName);

  // Cost tracker
  const costTracker = createCostTracker();

  return {
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<GatewayResponse> {
      const chatOpts: ChatOptions = {
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        ...opts,
      };

      // Determine the effective provider list
      let effectiveProviders = providers;
      if (chatOpts.provider) {
        const specific = getProvider(chatOpts.provider);
        effectiveProviders = [specific];
      }

      // Build cache context and check cache
      const promptText = messages.map((m) => m.content).join("\n");
      const cacheContext = {
        prompt: promptText,
        model: chatOpts.model ?? "",
        params: { maxTokens: chatOpts.maxTokens, temperature: chatOpts.temperature },
        ttl: chatOpts.cacheTtl,
      };
      const cacheKey = computeCacheKey(cacheContext);

      const cached = await caching.get(cacheKey, cacheContext);
      if (cached) {
        gatewayCacheTotal.add(1, { result: "hit" });
        return cached.response;
      }
      gatewayCacheTotal.add(1, { result: "miss" });

      // Route to a provider
      const routingContext = {
        prompt: promptText,
        model: chatOpts.model,
        tags: chatOpts.tags,
      };
      const selectedProvider = routing.select(effectiveProviders, routingContext);

      // Build the fallback order: the routed provider first, then the
      // remaining configured providers in order. If the routed provider's
      // call fails (provider error or an open circuit breaker), the gateway
      // tries the next one. recordOutcome fires per attempt so learning
      // strategies see both the failure and the eventual success.
      const candidates = [
        selectedProvider,
        ...effectiveProviders.filter((p) => p.name !== selectedProvider.name),
      ];

      let response: GatewayResponse | undefined;
      let lastError: unknown;

      for (const provider of candidates) {
        // Apply model override from config if not set in options. Recomputed
        // per candidate so each provider gets its own configured model.
        const attemptOpts: ChatOptions = { ...chatOpts };
        if (!attemptOpts.model && config.models?.[provider.name]) {
          attemptOpts.model = config.models[provider.name];
        }

        try {
          response = await provider.chat(messages, attemptOpts);
          routing.recordOutcome?.(provider.name, response.latencyMs, true);
          break;
        } catch (error) {
          lastError = error;
          routing.recordOutcome?.(provider.name, 0, false);
        }
      }

      // All candidates failed — surface the last error.
      if (!response) {
        throw lastError instanceof Error
          ? lastError
          : new Error(`All providers failed: ${String(lastError)}`);
      }

      // Record metrics
      const labels = { provider: response.provider, model: response.model };
      gatewayRequestTotal.add(1, labels);
      // latencyMs -> seconds: the histogram is in base units (see metrics.ts).
      gatewayRequestDuration.record(response.latencyMs / 1000, labels);
      gatewayTokenUsage.add(response.inputTokens, { ...labels, direction: "input" });
      gatewayTokenUsage.add(response.outputTokens, { ...labels, direction: "output" });
      gatewayCostTotal.add(response.cost, labels);

      // Bedrock prompt-cache events (only providers that report cache tokens —
      // Bedrock via Converse — populate these; distinct from the response cache).
      if (response.cacheReadTokens !== undefined || response.cacheWriteTokens !== undefined) {
        for (const kind of bedrockCacheKinds(
          response.cacheReadTokens ?? 0,
          response.cacheWriteTokens ?? 0,
        )) {
          bedrockCacheTotal.add(1, { ...labels, kind });
        }
      }

      // Record cost
      costTracker.record(response, chatOpts.tags ?? {});

      // Store in cache
      await caching.set(cacheKey, response, cacheContext);

      return response;
    },

    getCosts(filters?: CostFilters): CostSummary {
      return costTracker.query(filters);
    },

    async close(): Promise<void> {
      await caching.close();
    },
  };
}
