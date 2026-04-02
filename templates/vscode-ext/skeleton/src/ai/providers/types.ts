export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiProvider {
  sendMessage(messages: ChatMessage[], apiKey: string, model?: string): Promise<string>;
  defaultModel: string;
}
