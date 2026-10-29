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

  /**
   * The model a request calls when its body names `model`: that model or
   * the default, for a provider that takes the caller's choice, and the
   * provider's own for one that decides the model server-side.
   */
  resolveModel(model?: string): string;
}
