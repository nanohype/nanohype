// ── LLM Gateway — Main Exports ──────────────────────────────────────
//
// Public API for the LLM gateway module. Imports providers, routing
// strategies, and caching strategies so they self-register, then
// exposes createGateway as the primary entry point.
//

import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import { getProvider, listProviders } from "./providers/index.js";
import { getStrategy } from "./routing/index.js";
import { getCachingStrategy } from "./caching/index.js";
import { computeCacheKey } from "./caching/hash.js";
import { createCostTracker } from "./cost/tracker.js";
import {
  gatewayRequestTotal,
  gatewayRequestDuration,
  gatewayTokenUsage,
  gatewayCostTotal,
  gatewayCacheTotal,
} from "./metrics.js";
import type { GatewayProvider } from "./providers/types.js";
import type { GatewayConfig, ChatMessage, ChatOptions, GatewayResponse } from "./types.js";
import type { CostFilters, CostSummary } from "./cost/tracker.js";

// Re-export everything consumers need
export { registerProvider, getProvider, listProviders } from "./providers/index.js";
export type { GatewayProvider, ProviderPricing } from "./providers/types.js";
export { registerStrategy, getStrategy, listStrategies } from "./routing/index.js";
export type { RoutingStrategy, RoutingContext } from "./routing/types.js";
export {
  registerCachingStrategy,
  getCachingStrategy,
  listCachingStrategies,
} from "./caching/index.js";
export type { CachingStrategy, CacheContext, CachedResponse } from "./caching/types.js";
export { createCostTracker } from "./cost/tracker.js";
export type { CostEntry, CostFilters, CostSummary, CostTracker } from "./cost/tracker.js";
export { detectAnomalies } from "./cost/anomaly.js";
export type { AnomalyResult } from "./cost/anomaly.js";
export { calculateCost, getModelPricing, DEFAULT_PRICING } from "./cost/pricing.js";
export { countTokens } from "./tokens/counter.js";
export type {
  GatewayConfig,
  ChatMessage,
  ChatOptions,
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
  models: z.record(z.string()).optional(),
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

      // Apply model override from config if not set in options
      if (!chatOpts.model && config.models?.[selectedProvider.name]) {
        chatOpts.model = config.models[selectedProvider.name];
      }

      // Call the provider
      let response: GatewayResponse;
      let success = true;

      try {
        response = await selectedProvider.chat(messages, chatOpts);
      } catch (error) {
        success = false;
        routing.recordOutcome?.(selectedProvider.name, 0, false);
        throw error;
      }

      // Record outcome for learning strategies
      routing.recordOutcome?.(selectedProvider.name, response.latencyMs, true);

      // Record metrics
      const labels = { provider: response.provider, model: response.model };
      gatewayRequestTotal.add(1, labels);
      gatewayRequestDuration.record(response.latencyMs, labels);
      gatewayTokenUsage.add(response.inputTokens, { ...labels, direction: "input" });
      gatewayTokenUsage.add(response.outputTokens, { ...labels, direction: "output" });
      gatewayCostTotal.add(response.cost, labels);

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
