import { getProvider, listProviders } from "./providers";
import type { ChatMessage } from "./providers";

export interface AiClientOptions {
  provider: string;
  apiKey: string;
  model?: string;
}

export class AiClient {
  private readonly options: AiClientOptions;

  constructor(options: AiClientOptions) {
    this.options = options;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const provider = getProvider(this.options.provider);
    return provider.sendMessage(
      messages,
      this.options.apiKey,
      this.options.model ?? provider.defaultModel,
    );
  }

  static availableProviders(): string[] {
    return listProviders();
  }
}

export type { ChatMessage };
