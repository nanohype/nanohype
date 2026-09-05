import * as vscode from "vscode";
import { validateBootstrap } from "./bootstrap.js";
import { registerExampleCommand } from "./commands/example";
// #if IncludeWebview && IncludeAi
import { registerWebviewCommand } from "./commands/webview";

// #endif

/**
 * Register the webview panel command.
 *
 * `contributes` in package.json is JSON and carries no conditional, so the
 * Command Palette offers this entry, and the settings UI offers `provider` and
 * `model`, in every build. Answering both here unconditionally is what keeps
 * those offers honest: a build with the panel opens it and sends the turn to
 * the configured provider, and a build without it says so — rather than
 * failing with an unknown-command error that reads like a broken install, or
 * leaving a settings control that silently changes nothing.
 */
function registerWebviewPanelCommand(context: vscode.ExtensionContext): void {
  // #if IncludeWebview && IncludeAi
  registerWebviewCommand(context);
  // #endif
  // #if !(IncludeWebview && IncludeAi)
  context.subscriptions.push(
    vscode.commands.registerCommand("__PROJECT_NAME__.openWebview", () => {
      // Read here so the answer names what the user actually set. Someone who
      // has changed `provider` or `model` is owed the reason nothing happened,
      // and the settings UI gives no hint that this build has no panel.
      const settings = vscode.workspace.getConfiguration("__PROJECT_NAME__");
      const provider = settings.get<string>("provider");
      const model = settings.get<string>("model");
      const configured = [provider, model].some((value) => value !== undefined && value !== "");

      void vscode.window.showInformationMessage(
        "__EXTENSION_NAME__ was set up without the webview panel. Add it by scaffolding with " +
          "the webview and AI options enabled." +
          (configured ? " The provider and model settings have no effect until then." : ""),
      );
    }),
  );
  // #endif
}

export function activate(context: vscode.ExtensionContext): void {
  validateBootstrap();
  console.log("__EXTENSION_NAME__ is now active");

  // Every command `contributes.commands` declares is registered here, and
  // every command registered here is one it declares. A contributed command
  // with no registration still appears in the Command Palette and fails when
  // it is chosen, which is why the pairing is asserted rather than assumed.
  registerExampleCommand(context);
  registerWebviewPanelCommand(context);
}

export function deactivate(): void {
  // Cleanup logic here
}
