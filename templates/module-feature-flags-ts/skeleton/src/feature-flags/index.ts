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
import { evaluate, notFoundResult } from "./evaluator.js";
import { flagEvalDuration, flagEvalTotal } from "./metrics.js";
import { getStore, listStores } from "./stores/index.js";
import type { FlagStore } from "./stores/types.js";
import type { FlushCallback, TrackingRecord, VariantTracker } from "./tracker.js";
import { createVariantTracker } from "./tracker.js";
import type {
  EvaluationResult,
  Flag,
  FlagServiceConfig,
  FlagType,
  Rule,
  TargetingContext,
  Variant,
} from "./types.js";

export { evaluate, notFoundResult } from "./evaluator.js";
// Re-export everything consumers need
export { getStore, listStores, registerStore } from "./stores/index.js";
export type { FlagStore } from "./stores/types.js";
export type { FlushCallback, TrackingRecord, VariantTracker } from "./tracker.js";
export { createVariantTracker } from "./tracker.js";
export type {
  EvaluationResult,
  Flag,
  FlagServiceConfig,
  FlagType,
  Rule,
  TargetingContext,
  Variant,
} from "./types.js";

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
export async function createFlagService(config: FlagServiceConfig = {}): Promise<FlagService> {
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
        flagEvalDuration.record((performance.now() - start) / 1000);
        return result;
      }

      const result = evaluate(flag, context);
      const durationMs = performance.now() - start;

      flagEvalTotal.add(1, { flagKey, variant: result.variant });
      flagEvalDuration.record(durationMs / 1000);

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
