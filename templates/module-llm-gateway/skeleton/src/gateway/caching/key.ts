import { createHash } from "node:crypto";
import type { CacheContext } from "./types.js";

// ── Cache Key Generation ───────────────────────────────────────────
//
// SHA-256 of model + prompt + JSON(params). Shared by all caching
// strategies that need a deterministic key from request context.
//

/**
 * Compute a deterministic cache key from the request context.
 * Returns a hex-encoded SHA-256 hash of model, prompt, and params.
 */
export function computeCacheKey(context: CacheContext): string {
  const raw = `${context.model}:${context.prompt}:${JSON.stringify(context.params)}`;
  return createHash("sha256").update(raw).digest("hex");
}
