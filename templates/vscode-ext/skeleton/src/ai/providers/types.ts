export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** What a provider call reads from the extension's settings. */
export interface ProviderSettings {
  /** The model a call names. The provider's default model when unset. */
  model?: string;
  /** The AWS profile a provider that calls AWS signs with. The AWS SDK's default chain when unset. */
  awsProfile?: string;
  /** The AWS region such a provider calls in. The provider's default region when unset. */
  awsRegion?: string;
}

export interface AiProvider {
  /** Sends the conversation and returns the reply's text. */
  sendMessage(messages: ChatMessage[], settings: ProviderSettings): Promise<string>;
  /** The model a call names when the settings name none. */
  readonly defaultModel: string;
}
