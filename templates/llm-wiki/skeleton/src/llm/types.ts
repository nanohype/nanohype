export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmProvider {
  readonly name: string;
  complete(messages: LlmMessage[], opts?: LlmOptions): Promise<string>;
}
