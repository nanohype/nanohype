// ── Bedrock prompt-cache bookkeeping ────────────────────────────────
//
// Pure + dependency-free (no AWS SDK import) so it's unit-testable on its own.
// The Bedrock Converse API reports prompt-cache token counts in `usage`; this
// turns them into the cache events the gateway counts via bedrock_cache_total.
//
// This is the only place the cache is measurable: Converse exposes
// cacheReadInputTokens / cacheWriteInputTokens, whereas the raw InvokeModel API
// (system prompt marked `cache_control: ephemeral`) does NOT surface cache
// tokens in its response body. The gateway standardizes on Converse so the
// prompt-cache hit ratio is observable.

export type BedrockCacheKind = "hit" | "write" | "miss";

/** Converse usage block fields relevant to prompt caching. */
export interface BedrockCacheUsage {
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}

/** Cache token counts off a Converse usage block (0 when caching isn't in play). */
export function readBedrockCacheTokens(usage: BedrockCacheUsage | undefined): {
  cacheReadTokens: number;
  cacheWriteTokens: number;
} {
  return {
    cacheReadTokens: usage?.cacheReadInputTokens ?? 0,
    cacheWriteTokens: usage?.cacheWriteInputTokens ?? 0,
  };
}

/**
 * The cache events a single call represents: input served from cache is a hit,
 * input written to cache is a write, and neither is a miss. A call can both read
 * (reuse the cached prefix) and write (extend it), so it may emit two kinds.
 */
export function bedrockCacheKinds(
  cacheReadTokens: number,
  cacheWriteTokens: number,
): BedrockCacheKind[] {
  const kinds: BedrockCacheKind[] = [];
  if (cacheReadTokens > 0) kinds.push("hit");
  if (cacheWriteTokens > 0) kinds.push("write");
  if (kinds.length === 0) kinds.push("miss");
  return kinds;
}
