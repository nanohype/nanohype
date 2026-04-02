/**
 * Shared types for all LLM providers.
 *
 * The ChatMessage shape covers the conversation history passed between
 * the bot and the LLM. Provider implementations map their native
 * request/response formats to this common interface.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Provider interface that every LLM backend must implement.
 */
export interface LlmProvider {
  /**
   * Send a conversation to the LLM and return its text response.
   * The system prompt sets the bot's personality and formatting rules.
   */
  chat(
    systemPrompt: string,
    messages: ChatMessage[],
  ): Promise<string>;
}
