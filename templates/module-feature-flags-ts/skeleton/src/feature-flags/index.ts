// ── Module Feature Flags — Main Exports ─────────────────────────────
//
// Public API for the feature flags module. Import stores so they
// self-register, then expose createFlagService as the primary entry
// point. The service wraps flag storage, evaluation, and variant
// tracking behind a single facade.
//

import { z } from "zod";
import { validateBootstrap } from "./bootstrap.js";
import { FlagServiceConfigSchema } from "./config.js";
import { getStore, listStores } from "./stores/index.js";
import { evaluate, notFoundResult } from "./evaluator.js";
import { createVariantTracker } from "./tracker.js";
import { flagEvalTotal, flagEvalDuration } from "./metrics.js";
import type { FlagStore } from "./stores/types.js";
import type {
  Flag,
  FlagType,
  Variant,
  Rule,
  TargetingContext,
  EvaluationResult,
  FlagServiceConfig,
} from "./types.js";
import type { VariantTracker, TrackingRecord, FlushCallback } from "./tracker.js";

// Re-export everything consumers need
export { registerStore, getStore, listStores } from "./stores/index.js";
export { evaluate, notFoundResult } from "./evaluator.js";
export { createVariantTracker } from "./tracker.js";
export type { FlagStore } from "./stores/types.js";
export type {
  Flag,
  FlagType,
  Variant,
  Rule,
  TargetingContext,
  EvaluationResult,
  FlagServiceConfig,
} from "./types.js";
export type { VariantTracker, TrackingRecord, FlushCallback } from "./tracker.js";

// ── Flag Service Facade ─────────────────────────────────────────────

export interface FlagService {
  /** The underlying flag store instance. */
  store: FlagStore;

  /** The variant tracker instance (if tracking is enabled). */
  tracker: VariantTracker | null;

  /**
   * Evaluate a flag for the given targeting context.
   * Returns the resolved variant and value. Records the evaluation
   * with the variant tracker if tracking is enabled.
   */
  evaluate(flagKey: string, context?: TargetingContext): Promise<EvaluationResult>;

  /** Retrieve a flag definition by key. */
  getFlag(key: string): Promise<Flag | undefined>;

  /** Store or update a flag definition. */
  setFlag(flag: Flag): Promise<void>;

  /** List all flag definitions. */
  listFlags(): Promise<Flag[]>;

  /** Delete a flag by key. */
  deleteFlag(key: string): Promise<void>;

  /** Shut down the service, flushing tracker and closing the store. */
  close(): Promise<void>;
}

/**
 * Create a configured flag service backed by the named store.
 *
 * The store must already be registered (built-in stores self-register
 * on import via the stores barrel).
 *
 *   const flags = await createFlagService({ storeName: "memory" });
 *   const result = await flags.evaluate("new-checkout", { userId: "user-42" });
 *   console.log(result.variant, result.value);
 */
export async function createFlagService(
  config: FlagServiceConfig = {},
): Promise<FlagService> {
  const parsed = FlagServiceConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid flag service config: ${issues}`);
  }

  validateBootstrap();

  const { storeName, storeConfig, enableTracking } = parsed.data;
  const store = getStore(storeName);
  await store.init(storeConfig);

  const tracker = enableTracking ? createVariantTracker() : null;

  return {
    store,
    tracker,

    async evaluate(flagKey: string, context: TargetingContext = {}): Promise<EvaluationResult> {
      const start = performance.now();

      const flag = await store.getFlag(flagKey);
      if (!flag) {
        const result = notFoundResult(flagKey);
        flagEvalDuration.record(performance.now() - start);
        return result;
      }

      const result = evaluate(flag, context);
      const durationMs = performance.now() - start;

      flagEvalTotal.add(1, { flagKey, variant: result.variant });
      flagEvalDuration.record(durationMs);

      if (tracker) {
        tracker.record(flagKey, result.variant, context.userId);
      }

      return result;
    },

    async getFlag(key: string): Promise<Flag | undefined> {
      return store.getFlag(key);
    },

    async setFlag(flag: Flag): Promise<void> {
      return store.setFlag(flag);
    },

    async listFlags(): Promise<Flag[]> {
      return store.listFlags();
    },

    async deleteFlag(key: string): Promise<void> {
      return store.deleteFlag(key);
    },

    async close(): Promise<void> {
      if (tracker) await tracker.close();
      await store.close();
    },
  };
}
