import * as vscode from "vscode";

export function registerExampleCommand(
  context: vscode.ExtensionContext,
): void {
  const disposable = vscode.commands.registerCommand(
    "__PROJECT_NAME__.example",
    async () => {
      const input = await vscode.window.showInputBox({
        prompt: "Enter a message",
        placeHolder: "Hello from __EXTENSION_NAME__",
      });

      if (input !== undefined) {
        vscode.window.showInformationMessage(
          `__EXTENSION_NAME__: ${input || "No message provided"}`,
        );
      }
    },
  );

  context.subscriptions.push(disposable);
}
