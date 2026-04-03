// ── Core Types ─────────────────────────────────────────────────────
//
// Shared type definitions for the LLM observability module. All
// subsystems (tracer, cost, quality, exporters) reference these
// types for interop.
//

import { z } from "zod";

/** An LLM response returned from a traced call. */
export interface LlmResponse {
  /** Generated text content. */
  text: string;
  /** Model identifier (e.g., "claude-sonnet-4-20250514"). */
  model: string;
  /** Provider name (e.g., "anthropic", "openai"). */
  provider: string;
  /** Number of input tokens consumed. */
  inputTokens: number;
  /** Number of output tokens generated. */
  outputTokens: number;
}

/** A captured span from a traced LLM call. */
export interface LlmSpan {
  /** Unique span identifier. */
  id: string;
  /** ISO-8601 timestamp when the call started. */
  startedAt: string;
  /** ISO-8601 timestamp when the call completed. */
  endedAt: string;
  /** Duration of the call in milliseconds. */
  durationMs: number;
  /** Model used for this call. */
  model: string;
  /** Provider that handled the call. */
  provider: string;
  /** Input tokens consumed. */
  inputTokens: number;
  /** Output tokens generated. */
  outputTokens: number;
  /** Cost in USD (0 if cost tracking is disabled or model is unknown). */
  cost: number;
  /** Whether the call succeeded. */
  success: boolean;
  /** Error message if the call failed. */
  error?: string;
  /** Optional tags for attribution. */
  tags: Record<string, string>;
}

/** An event emitted by the observer. */
export interface LlmEvent {
  /** Event type. */
  type: "span" | "cost" | "quality" | "error";
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Event payload. */
  payload: unknown;
}

/** A cost entry for a single LLM call. */
export interface CostEntry {
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Provider that handled the request. */
  provider: string;
  /** Model used. */
  model: string;
  /** Input tokens consumed. */
  inputTokens: number;
  /** Output tokens generated. */
  outputTokens: number;
  /** Total cost in USD. */
  cost: number;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Attribution tags. */
  tags: Record<string, string>;
}

/** A quality score for a single request. */
export interface QualityScore {
  /** Request identifier. */
  requestId: string;
  /** Quality score (0.0 to 1.0). */
  score: number;
  /** ISO-8601 timestamp when recorded. */
  recordedAt: string;
}

/** Configuration for createLlmObserver(). */
export interface ObserverConfig {
  /** Service name for OTel attribution. */
  serviceName: string;
  /** Service version. Default: "0.0.0". */
  serviceVersion?: string;
  /** Exporter name — must match a registered exporter. Default: "console". */
  exporterName?: string;
  /** Enable cost tracking. Default: true. */
  costTracking?: boolean;
  /** Quality regression threshold (negative trend below this triggers alert). Default: -0.1. */
  qualityThreshold?: number;
  /** Default tags applied to all spans. */
  defaultTags?: Record<string, string>;
}

/** Zod schema for ObserverConfig validation. */
export const ObserverConfigSchema = z.object({
  serviceName: z.string().min(1, "serviceName is required"),
  serviceVersion: z.string().optional(),
  exporterName: z.string().optional(),
  costTracking: z.boolean().optional(),
  qualityThreshold: z.number().optional(),
  defaultTags: z.record(z.string()).optional(),
});
