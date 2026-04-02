import type { Tool } from "../tools/registry.js";

/**
 * Shared types for all LLM providers.
 *
 * ContentBlock uses a union shape that covers both Anthropic-style
 * (tool_use / tool_result with structured content) and OpenAI-style
 * (text-only content blocks). Provider implementations map their
 * native responses into this common shape.
 */

export interface Message {
  role: "user" | "assistant" | "tool";
  content: string | ContentBlock[] | null;
  tool_calls?: ToolCallMessage[];
  tool_call_id?: string;
}

export interface ToolCallMessage {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmResponse {
  content: ContentBlock[];
  toolCalls: ToolCall[];
  stopReason: string;
  rawAssistantMessage: Message;
}

/**
 * Provider interface that every LLM backend must implement.
 */
export interface LlmProvider {
  /**
   * Send a conversation to the LLM and return its response, including
   * any tool-call requests.
   */
  sendMessage(
    systemPrompt: string,
    messages: Message[],
    tools: Tool[],
  ): Promise<LlmResponse>;

  /**
   * Build a tool-result message in the format the provider expects.
   * Anthropic uses role "user" with a tool_result content block;
   * OpenAI uses role "tool" with a tool_call_id field.
   */
  makeToolResultMessage(toolCallId: string, result: string): Message;
}
