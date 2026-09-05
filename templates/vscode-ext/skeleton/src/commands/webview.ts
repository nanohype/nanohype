import * as vscode from "vscode";
import { API_KEY_SECRET, makeChatHandler } from "../ai/chat-session";
import { WebviewPanel } from "../webview/panel";

/** Wire the Command Palette entry `contributes.commands` declares. */
export function registerWebviewCommand(context: vscode.ExtensionContext): void {
  const chat = makeChatHandler({
    getConfiguration: () => {
      const config = vscode.workspace.getConfiguration("__PROJECT_NAME__");
      return {
        provider: config.get<string>("provider") ?? "anthropic",
        model: config.get<string>("model") || undefined,
      };
    },
    getApiKey: () => Promise.resolve(context.secrets.get(API_KEY_SECRET)),
    requestApiKey: () =>
      Promise.resolve(
        vscode.window.showInputBox({
          prompt: "__EXTENSION_NAME__: API key for the configured AI provider",
          password: true,
          ignoreFocusOut: true,
        }),
      ),
    storeApiKey: (key) => Promise.resolve(context.secrets.store(API_KEY_SECRET, key)),
  });

  const disposable = vscode.commands.registerCommand("__PROJECT_NAME__.openWebview", () => {
    WebviewPanel.createOrShow(context.extensionUri, chat);
  });

  context.subscriptions.push(disposable);
}
