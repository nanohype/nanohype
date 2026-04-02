/**
 * Shared types for LLM provider implementations.
 */

/**
 * A single message in a chat conversation.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Common interface that every LLM provider must implement.
 * Accepts a list of chat messages and returns the model's text response.
 */
export interface LlmProvider {
  complete(messages: ChatMessage[]): Promise<string>;
}
