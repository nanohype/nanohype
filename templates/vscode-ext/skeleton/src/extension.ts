import * as vscode from "vscode";
import { registerExampleCommand } from "./commands/example";

export function activate(context: vscode.ExtensionContext): void {
  console.log("__EXTENSION_NAME__ is now active");

  registerExampleCommand(context);
}

export function deactivate(): void {
  // Cleanup logic here
}
