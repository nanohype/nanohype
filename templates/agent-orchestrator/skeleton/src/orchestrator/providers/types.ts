// ── LLM Provider Interface ──────────────────────────────────────────
//
// Simplified provider interface for orchestration reasoning. Unlike
// agentic-loop providers that handle full tool-calling conversations,
// orchestrator providers only need to produce text completions for
// task decomposition and agent reasoning.
//

/** Provider interface that every LLM backend must implement. */
export interface LlmProvider {
  /** Unique provider name (e.g., "anthropic", "openai"). */
  readonly name: string;

  /**
   * Send a system prompt and user message, return the text response.
   * This is the primary interface for orchestration reasoning — the
   * planner and agents use this to produce structured output.
   */
  complete(systemPrompt: string, userMessage: string): Promise<string>;
}
