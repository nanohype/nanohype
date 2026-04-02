import { logger } from "./logger.js";
import { getProvider } from "./providers/index.js";
import type { ChatMessage } from "./providers/index.js";

const DEFAULT_PROVIDER = "__LLM_PROVIDER__";

/**
 * Send a chat message to the configured LLM provider and return the response.
 *
 * The provider is resolved from the registry, which supports any registered
 * provider implementation. Providers self-register at import time.
 */
export async function sendMessage(
  messages: ChatMessage[],
  apiKey: string,
  provider?: string,
  model?: string,
): Promise<string> {
  const resolvedProvider = provider ?? DEFAULT_PROVIDER;
  const p = getProvider(resolvedProvider);
  logger.debug("ai.send", { provider: resolvedProvider, model: model ?? p.defaultModel });
  return p.sendMessage(messages, apiKey, model ?? p.defaultModel);
}
