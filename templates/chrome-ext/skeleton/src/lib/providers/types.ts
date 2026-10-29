export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Where a provider sends a conversation, as the options page sets it. */
export interface ProviderSettings {
  /** The gateway root, as ModelGateway status.endpoint publishes it. */
  endpoint: string;
  /** The ModelGateway route a request names as its model. */
  route: string;
}

export interface AiProvider {
  sendMessage(messages: ChatMessage[], settings: ProviderSettings): Promise<string>;
}
