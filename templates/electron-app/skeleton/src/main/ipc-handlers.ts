import type { IpcMain } from "electron";
import { getProvider } from "./providers/index.js";

/**
 * IPC handler for AI calls.
 *
 * Receives chat messages from the renderer via the preload bridge and calls
 * the provider the payload names, or LLM_PROVIDER. The provider signs its
 * calls in the main process, so the renderer never holds a credential.
 */

interface SendMessagePayload {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  provider?: string;
  model?: string;
}

export function registerIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle("ai:send-message", async (_event, payload: SendMessagePayload) => {
    const providerName = payload.provider || process.env.LLM_PROVIDER || "__LLM_PROVIDER__";

    try {
      const provider = getProvider(providerName);
      const content = await provider.sendMessage(payload.messages, payload.model);
      return { content };
    } catch (err) {
      return {
        content: "",
        error: err instanceof Error ? err.message : "Failed to get AI response",
      };
    }
  });
}
