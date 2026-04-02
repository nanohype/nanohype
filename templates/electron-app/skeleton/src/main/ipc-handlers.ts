import type { IpcMain } from "electron";
import { getProvider } from "./providers/index.js";

/**
 * IPC handler for AI calls.
 *
 * Receives chat messages from the renderer via the preload bridge,
 * resolves the API key from environment variables, and calls the
 * configured LLM provider. API keys stay in the main process.
 */

interface SendMessagePayload {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  provider?: string;
  model?: string;
}

export function registerIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    "ai:send-message",
    async (_event, payload: SendMessagePayload) => {
      const providerName =
        payload.provider ?? process.env.LLM_PROVIDER ?? "__LLM_PROVIDER__";

      const apiKey = resolveApiKey(providerName);
      if (!apiKey) {
        return {
          content: "",
          error: `No API key found for provider "${providerName}". Set the corresponding environment variable.`,
        };
      }

      try {
        const provider = getProvider(providerName);
        const content = await provider.sendMessage(
          payload.messages,
          apiKey,
          payload.model,
        );
        return { content };
      } catch (err) {
        return {
          content: "",
          error:
            err instanceof Error ? err.message : "Failed to get AI response",
        };
      }
    },
  );
}

/**
 * Resolves an API key from environment variables based on provider name.
 */
function resolveApiKey(provider: string): string | undefined {
  const envMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
  };

  const envVar = envMap[provider];
  return envVar ? process.env[envVar] : undefined;
}
