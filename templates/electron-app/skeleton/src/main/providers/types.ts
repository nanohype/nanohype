export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiProvider {
  /** Sends the conversation and returns the reply's text, naming `model` when given. */
  sendMessage(messages: ChatMessage[], model?: string): Promise<string>;
  /** The model a call names when the renderer names none. */
  readonly defaultModel: string;
}
