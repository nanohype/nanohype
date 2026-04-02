export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiProvider {
  /** Generate a complete response from the given messages. */
  sendMessage(messages: ChatMessage[], model?: string): Promise<string>;

  /** Stream a response, yielding text chunks via an async iterator. */
  streamMessage(messages: ChatMessage[], model?: string): AsyncIterable<string>;

  /** The default model identifier for this provider. */
  defaultModel: string;
}
