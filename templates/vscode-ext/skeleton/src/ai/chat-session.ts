import type { ChatHandler } from "../webview/protocol";
import { AiClient } from "./client";

/**
 * The SecretStorage key holding the provider API key. VS Code encrypts
 * SecretStorage per machine, which is why the key never reaches settings.json
 * or an environment variable — both are readable by anything the user runs.
 */
export const API_KEY_SECRET = "__PROJECT_NAME__.apiKey";

/**
 * What a chat turn needs from the extension host, named so the host supplies
 * it and a test supplies it the same way. Nothing here imports `vscode`: the
 * module resolves only inside the extension host, so logic that reaches for it
 * directly can only be exercised by launching one.
 */
export interface ChatHandlerDeps {
  getConfiguration: () => { provider: string; model?: string };
  getApiKey: () => Promise<string | undefined>;
  requestApiKey: () => Promise<string | undefined>;
  storeApiKey: (key: string) => Promise<void>;
  createClient?: (options: { provider: string; apiKey: string; model?: string }) => {
    chat: (messages: { role: "user" | "assistant"; content: string }[]) => Promise<string>;
  };
}

/**
 * Build the function that answers a chat turn.
 *
 * The key is read from SecretStorage and requested once if absent, so the
 * first message in a fresh install prompts rather than failing. Declining the
 * prompt throws: the webview holds the turn open until the host answers, and
 * an error is an answer where a silent return is not.
 */
export function makeChatHandler(deps: ChatHandlerDeps): ChatHandler {
  return async (text: string): Promise<string> => {
    let apiKey = await deps.getApiKey();
    if (!apiKey) {
      apiKey = await deps.requestApiKey();
      if (!apiKey) {
        throw new Error("No API key was provided, so the message was not sent.");
      }
      await deps.storeApiKey(apiKey);
    }

    const { provider, model } = deps.getConfiguration();
    const create = deps.createClient ?? ((options) => new AiClient(options));
    return create({ provider, apiKey, model }).chat([{ role: "user", content: text }]);
  };
}
