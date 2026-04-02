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

/** Token usage returned by the provider, when available. */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmResponse {
  content: ContentBlock[];
  toolCalls: ToolCall[];
  stopReason: string;
  rawAssistantMessage: Message;
  /** Token usage for this request, if the provider reports it. */
  usage?: TokenUsage;
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
   * Stream a conversation to the LLM, yielding text chunks as they
   * arrive. Returns an async iterable of string fragments. The full
   * LlmResponse (including any tool calls) is available after the
   * stream completes via the `response` property on the returned object.
   */
  streamChat(
    systemPrompt: string,
    messages: Message[],
    tools: Tool[],
  ): StreamChat;

  /**
   * Build a tool-result message in the format the provider expects.
   * Anthropic uses role "user" with a tool_result content block;
   * OpenAI uses role "tool" with a tool_call_id field.
   */
  makeToolResultMessage(toolCallId: string, result: string): Message;
}

/**
 * Streaming chat response. Implements AsyncIterable<string> to yield
 * text chunks as they arrive. Once the stream is consumed, the full
 * LlmResponse is available via the `response` promise.
 */
export interface StreamChat extends AsyncIterable<string> {
  /**
   * Resolves to the complete LlmResponse after the stream finishes.
   * Contains the aggregated content blocks, tool calls, and stop reason.
   */
  response: Promise<LlmResponse>;
}
