import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class WebviewPanel {
  public static currentPanel: WebviewPanel | undefined;
  private static readonly viewType = "__PROJECT_NAME__.webview";

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (WebviewPanel.currentPanel) {
      WebviewPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      WebviewPanel.viewType,
      "__EXTENSION_NAME__",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "dist", "webview"),
        ],
      },
    );

    WebviewPanel.currentPanel = new WebviewPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.update();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message: { type: string; payload?: unknown }) => {
        switch (message.type) {
          case "info":
            vscode.window.showInformationMessage(
              String(message.payload ?? ""),
            );
            break;
          case "error":
            vscode.window.showErrorMessage(String(message.payload ?? ""));
            break;
        }
      },
      null,
      this.disposables,
    );
  }

  private update(): void {
    this.panel.webview.html = this.getHtmlForWebview();
  }

  private getHtmlForWebview(): string {
    const webview = this.panel.webview;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "app.js"),
    );

    const nonce = getNonce();

    const htmlPath = path.join(
      this.extensionUri.fsPath,
      "src",
      "webview",
      "app",
      "index.html",
    );
    let html = fs.readFileSync(htmlPath, "utf-8");

    // Inject CSP, nonce, and script URI into the template
    html = html
      .replace("{{CSP_SOURCE}}", webview.cspSource)
      .replace(/{{NONCE}}/g, nonce)
      .replace("{{SCRIPT_URI}}", scriptUri.toString());

    return html;
  }

  private dispose(): void {
    WebviewPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
