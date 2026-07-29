import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload script — exposes a minimal API to the renderer via contextBridge.
 *
 * The renderer calls window.electronAPI.sendMessage() which routes through
 * IPC to the main process. API keys never leave the main process.
 */

export interface ElectronAPI {
  sendMessage: (
    messages: Array<{ role: string; content: string }>,
    provider?: string,
    model?: string,
  ) => Promise<{ content: string; error?: string }>;
}

contextBridge.exposeInMainWorld("electronAPI", {
  sendMessage: (
    messages: Array<{ role: string; content: string }>,
    provider?: string,
    model?: string,
  ) => ipcRenderer.invoke("ai:send-message", { messages, provider, model }),
} satisfies ElectronAPI);
