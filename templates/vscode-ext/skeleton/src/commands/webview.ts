import * as vscode from "vscode";
import { makeChatHandler } from "../ai/chat-session";
import { WebviewPanel } from "../webview/panel";

/** Wire the Command Palette entry `contributes.commands` declares. */
export function registerWebviewCommand(context: vscode.ExtensionContext): void {
  const chat = makeChatHandler({
    getConfiguration: () => {
      const config = vscode.workspace.getConfiguration("__PROJECT_NAME__");
      return {
        provider: config.get<string>("provider") || "bedrock",
        model: config.get<string>("model") || undefined,
        awsProfile: config.get<string>("awsProfile") || undefined,
        awsRegion: config.get<string>("awsRegion") || undefined,
      };
    },
  });

  const disposable = vscode.commands.registerCommand("__PROJECT_NAME__.openWebview", () => {
    WebviewPanel.createOrShow(context.extensionUri, chat);
  });

  context.subscriptions.push(disposable);
}
