// ── Tracer Types ───────────────────────────────────────────────────

/** Options for configuring the LLM tracer. */
export interface TracerOptions {
  /** Service name for attribution. */
  serviceName: string;
  /** Default tags applied to all spans. */
  defaultTags?: Record<string, string>;
  /** Whether to record cost on each span. Default: true. */
  recordCost?: boolean;
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
}

/** Context captured during a traced LLM call. */
export interface SpanContext {
  /** Unique span identifier. */
  id: string;
  /** ISO-8601 start timestamp. */
  startedAt: string;
  /** Per-span tags merged with defaults. */
  tags: Record<string, string>;
}
