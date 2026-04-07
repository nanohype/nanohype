/**
 * Shared types for LLM provider implementations.
 *
 * Defines the contract every provider must satisfy. The ci-eval
 * pipeline only needs single-prompt completions, so the interface
 * is intentionally narrow.
 */

/**
 * Common interface that every LLM provider must implement.
 * Accepts a prompt string and returns the model's text response.
 */
export interface LlmProvider {
  complete(prompt: string): Promise<string>;
}
