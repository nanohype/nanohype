import type { ChatMessage, ProviderSettings } from "./providers";
import { getProvider, listProviders } from "./providers";

export interface AiClientOptions extends ProviderSettings {
  /** The registered provider a chat is sent to. */
  provider: string;
}

export class AiClient {
  private readonly options: AiClientOptions;

  constructor(options: AiClientOptions) {
    this.options = options;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const { provider: name, ...settings } = this.options;
    const provider = getProvider(name);
    return provider.sendMessage(messages, {
      ...settings,
      model: settings.model ?? provider.defaultModel,
    });
  }

  static availableProviders(): string[] {
    return listProviders();
  }
}

export type { ChatMessage };
