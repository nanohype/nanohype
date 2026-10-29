import type { ChatHandler } from "../webview/protocol";
import { AiClient, type AiClientOptions } from "./client";

/**
 * What a chat turn needs from the extension host, named so the host supplies
 * it and a test supplies it the same way. Nothing here imports `vscode`: the
 * module resolves only inside the extension host, so logic that reaches for it
 * directly can only be exercised by launching one.
 */
export interface ChatHandlerDeps {
  getConfiguration: () => AiClientOptions;
  createClient?: (options: AiClientOptions) => {
    chat: (messages: { role: "user" | "assistant"; content: string }[]) => Promise<string>;
  };
}

/**
 * Build the function that answers a chat turn.
 *
 * The settings are read on every turn, so a change in the settings UI applies
 * to the next message without reloading the window. The turn carries no
 * credential: the bedrock provider signs with the AWS profile the settings
 * name, through the AWS SDK's credential chain.
 */
export function makeChatHandler(deps: ChatHandlerDeps): ChatHandler {
  return async (text: string): Promise<string> => {
    const create = deps.createClient ?? ((options) => new AiClient(options));
    return create(deps.getConfiguration()).chat([{ role: "user", content: text }]);
  };
}
