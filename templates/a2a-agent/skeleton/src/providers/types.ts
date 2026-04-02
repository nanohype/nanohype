/**
 * Shared types for all LLM providers.
 *
 * The agent uses an LLM for reasoning about which skill to execute
 * and how to interpret incoming task requests. Provider implementations
 * map their native responses into this common shape.
 */

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface LlmResponse {
  content: string;
  stopReason: string;
}

/**
 * Provider interface that every LLM backend must implement.
 */
export interface LlmProvider {
  /**
   * Send a conversation to the LLM and return its response.
   * Used for agent reasoning — deciding which skill to invoke
   * and how to interpret results.
   */
  sendMessage(
    systemPrompt: string,
    messages: Message[],
  ): Promise<LlmResponse>;
}
