import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `registerWebviewCommand` reaches the extension host directly — `vscode`
 * resolves only inside one — so the host module is faked here the same way
 * commands.test.ts fakes it. Only `vscode` is faked: the command, the panel it
 * opens, and the chat handler it builds all run as they ship.
 */

const mockRegisterCommand = vi.fn();
const mockCreateWebviewPanel = vi.fn();
const mockGetConfiguration = vi.fn();

vi.mock("vscode", () => ({
  window: {
    createWebviewPanel: (...args: unknown[]) => mockCreateWebviewPanel(...args),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    activeTextEditor: undefined,
  },
  commands: {
    registerCommand: (...args: unknown[]) => mockRegisterCommand(...args),
  },
  workspace: {
    getConfiguration: (...args: unknown[]) => mockGetConfiguration(...args),
  },
  Uri: { joinPath: vi.fn(() => ({ fsPath: "/ext", toString: () => "vscode-resource://app.js" })) },
  ViewColumn: { One: 1 },
}));

const { registerWebviewCommand } = await import("../commands/webview");
const { WebviewPanel } = await import("../webview/panel");
const { activate } = await import("../extension");

// The panel reads src/webview/app/index.html relative to the extension root,
// so the fake context points at this project's root. The HTML template is a
// real file and reading it is real work the panel does.
const EXTENSION_ROOT = join(import.meta.dirname, "..", "..");

function fakeContext() {
  return {
    subscriptions: [] as { dispose(): void }[],
    extensionUri: { fsPath: EXTENSION_ROOT },
  };
}

/** The webview surface `createWebviewPanel` hands back, with the host faked. */
function fakePanel() {
  const listeners: ((m: unknown) => void)[] = [];
  return {
    listeners,
    panel: {
      webview: {
        html: "",
        cspSource: "vscode-resource:",
        asWebviewUri: () => ({ toString: () => "vscode-resource://app.js" }),
        onDidReceiveMessage: (cb: (m: unknown) => void) => listeners.push(cb),
        postMessage: vi.fn(),
      },
      onDidDispose: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    },
  };
}

describe("registerWebviewCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The panel is a singleton by design — a second open reveals the first.
    // Each case here opens its own, so the static is cleared between them.
    WebviewPanel.currentPanel = undefined;
    mockRegisterCommand.mockReturnValue({ dispose: vi.fn() });
    mockGetConfiguration.mockReturnValue({
      get: (key: string) => (key === "provider" ? "bedrock" : ""),
    });
  });

  it("registers the command package.json contributes, under that exact id", () => {
    const context = fakeContext();

    registerWebviewCommand(context as never);

    expect(mockRegisterCommand).toHaveBeenCalledWith(
      "__PROJECT_NAME__.openWebview",
      expect.any(Function),
    );
  });

  it("pushes the disposable so the command is torn down with the extension", () => {
    const context = fakeContext();

    registerWebviewCommand(context as never);

    expect(context.subscriptions).toHaveLength(1);
  });

  it("opens a panel when the command runs", () => {
    const context = fakeContext();
    mockCreateWebviewPanel.mockReturnValue(fakePanel().panel);

    registerWebviewCommand(context as never);
    (mockRegisterCommand.mock.calls[0][1] as () => void)();

    expect(mockCreateWebviewPanel).toHaveBeenCalled();
  });

  it("carries a webview chat turn through to the configured provider", async () => {
    // End to end across the process boundary: the command opens the panel, the
    // panel routes the message, and the handler reads the settings and
    // resolves the provider. Only `vscode` is faked.
    const context = fakeContext();
    const fake = fakePanel();
    mockCreateWebviewPanel.mockReturnValue(fake.panel);
    mockGetConfiguration.mockReturnValue({
      get: (key: string) => (key === "provider" ? "no-such-provider" : ""),
    });

    registerWebviewCommand(context as never);
    (mockRegisterCommand.mock.calls[0][1] as () => void)();

    expect(fake.listeners).toHaveLength(1);
    fake.listeners[0]({ type: "chat", payload: "hello" });
    await vi.waitFor(() => expect(fake.panel.webview.postMessage).toHaveBeenCalled());

    expect(mockGetConfiguration).toHaveBeenCalledWith("__PROJECT_NAME__");
    // The provider name is one the registry does not hold, so the turn fails
    // there rather than sending a live request.
    expect(fake.panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "chatError" }),
    );
  });

  it("reads the provider, model and AWS settings for a turn, and nothing from SecretStorage", async () => {
    const context = { ...fakeContext(), secrets: { get: vi.fn(), store: vi.fn() } };
    const fake = fakePanel();
    mockCreateWebviewPanel.mockReturnValue(fake.panel);
    const reads: string[] = [];
    mockGetConfiguration.mockReturnValue({
      get: (key: string) => {
        reads.push(key);
        return key === "provider" ? "no-such-provider" : "";
      },
    });

    registerWebviewCommand(context as never);
    (mockRegisterCommand.mock.calls[0][1] as () => void)();
    fake.listeners[0]({ type: "chat", payload: "hello" });
    await vi.waitFor(() => expect(fake.panel.webview.postMessage).toHaveBeenCalled());

    expect(reads.sort()).toEqual(["awsProfile", "awsRegion", "model", "provider"]);
    expect(context.secrets.get).not.toHaveBeenCalled();
    expect(context.secrets.store).not.toHaveBeenCalled();
  });

  it("activate registers every command package.json contributes", () => {
    // `activate` is run and asked what it registered, because reading the
    // source for a `registerCommand` line passes whether or not `activate`
    // ever calls it.
    const context = fakeContext();
    const pkg = JSON.parse(readFileSync(join(EXTENSION_ROOT, "package.json"), "utf-8")) as {
      contributes: { commands: { command: string }[] };
    };

    activate(context as never);

    const registered = mockRegisterCommand.mock.calls.map((c) => c[0] as string);
    expect(pkg.contributes.commands.length).toBeGreaterThan(0);
    for (const { command } of pkg.contributes.commands) {
      expect(registered).toContain(command);
    }
  });
});
