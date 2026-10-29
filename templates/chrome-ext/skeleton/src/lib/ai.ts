import { logger } from "./logger.js";
import type { ChatMessage, ProviderSettings } from "./providers/index.js";
import { getProvider } from "./providers/index.js";

const DEFAULT_PROVIDER = "__LLM_PROVIDER__";

/**
 * Send a chat message to the configured LLM provider and return the response.
 *
 * The provider is resolved from the registry, which supports any registered
 * provider implementation. Providers self-register at import time.
 */
export async function sendMessage(
  messages: ChatMessage[],
  settings: ProviderSettings,
  provider: string = DEFAULT_PROVIDER,
): Promise<string> {
  logger.debug("ai.send", { provider, route: settings.route });
  return getProvider(provider).sendMessage(messages, settings);
}
