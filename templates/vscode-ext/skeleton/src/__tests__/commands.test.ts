import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests command handler logic. The actual `registerExampleCommand` function
 * is tightly coupled to the VS Code API (registerCommand, showInputBox,
 * showInformationMessage), so we mock the `vscode` module and verify
 * that the handler wires up correctly.
 */

const mockShowInputBox = vi.fn();
const mockShowInformationMessage = vi.fn();
const mockRegisterCommand = vi.fn();
const mockSubscriptions: { dispose(): void }[] = [];

/** Every configuration key a handler asked for, in the order it asked. */
const mockConfigReads: string[] = [];

vi.mock("vscode", () => ({
  window: {
    showInputBox: (...args: unknown[]) => mockShowInputBox(...args),
    showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
  },
  commands: {
    registerCommand: (...args: unknown[]) => mockRegisterCommand(...args),
  },
  workspace: {
    getConfiguration: (section?: string) => ({
      get: (key: string) => {
        mockConfigReads.push(section ? `${section}.${key}` : key);
        return undefined;
      },
    }),
  },
}));

describe("example command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptions.length = 0;
    mockRegisterCommand.mockReturnValue({ dispose: vi.fn() });
  });

  it("registers the command with the expected id", async () => {
    const { registerExampleCommand } = await import("../commands/example");

    registerExampleCommand({
      subscriptions: mockSubscriptions,
    } as never);

    expect(mockRegisterCommand).toHaveBeenCalledOnce();
    expect(mockRegisterCommand.mock.calls[0][0]).toBe("__PROJECT_NAME__.example");
  });

  it("pushes a disposable to context subscriptions", async () => {
    const { registerExampleCommand } = await import("../commands/example");

    registerExampleCommand({
      subscriptions: mockSubscriptions,
    } as never);

    expect(mockSubscriptions).toHaveLength(1);
  });

  it("shows an information message with user input", async () => {
    mockShowInputBox.mockResolvedValue("hello world");

    const { registerExampleCommand } = await import("../commands/example");

    registerExampleCommand({
      subscriptions: mockSubscriptions,
    } as never);

    // Extract the handler callback passed to registerCommand
    const handler = mockRegisterCommand.mock.calls[0][1] as () => Promise<void>;
    await handler();

    expect(mockShowInformationMessage).toHaveBeenCalledWith("__EXTENSION_NAME__: hello world");
  });

  it("shows fallback message when input is empty", async () => {
    mockShowInputBox.mockResolvedValue("");

    const { registerExampleCommand } = await import("../commands/example");

    registerExampleCommand({
      subscriptions: mockSubscriptions,
    } as never);

    const handler = mockRegisterCommand.mock.calls[0][1] as () => Promise<void>;
    await handler();

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      "__EXTENSION_NAME__: No message provided",
    );
  });

  it("does not show a message when input is cancelled", async () => {
    mockShowInputBox.mockResolvedValue(undefined);

    const { registerExampleCommand } = await import("../commands/example");

    registerExampleCommand({
      subscriptions: mockSubscriptions,
    } as never);

    const handler = mockRegisterCommand.mock.calls[0][1] as () => Promise<void>;
    await handler();

    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });
});

describe("contributed commands", () => {
  it("registers every command package.json contributes, and only those", async () => {
    // Both directions, in every build. A contributed command with no
    // registration appears in the Command Palette and fails when chosen; a
    // registration with no contribution is a handler nothing can reach.
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf-8"),
    ) as { contributes: { commands: { command: string }[] } };
    const contributed = pkg.contributes.commands.map((c) => c.command).sort();

    const { activate } = await import("../extension.js");
    activate({ subscriptions: [], extensionUri: { fsPath: "/ext" }, secrets: {} } as never);

    const registered = [
      ...new Set(mockRegisterCommand.mock.calls.map((c) => c[0] as string)),
    ].sort();

    expect(contributed.length).toBeGreaterThan(0);
    // Membership rather than call count: this suite runs against the project
    // as checked in, where both arms of each conditional block are present, so
    // the webview command is registered by both. A build has one arm, and this
    // suite cannot tell which — it sees a registration either way. What the
    // build does is asserted where a build can be rendered and activated.
    expect(registered).toEqual(contributed);
  });

  it("registers only commands package.json contributes", async () => {
    // Both directions hold in every build: the manifest carries no conditional,
    // so every entry it contributes is offered everywhere and every one is
    // registered everywhere.
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf-8"),
    ) as { contributes: { commands: { command: string }[] } };
    const contributed = pkg.contributes.commands.map((c) => c.command);

    const { activate } = await import("../extension.js");
    activate({ subscriptions: [], extensionUri: { fsPath: "/ext" }, secrets: {} } as never);

    const registered = mockRegisterCommand.mock.calls.map((call) => call[0] as string);
    expect(registered.length).toBeGreaterThan(0);
    for (const command of registered) {
      expect(contributed).toContain(command);
    }
  });
});

describe("contributed settings", () => {
  // `contributes.configuration` is JSON and carries no conditional, so the
  // settings UI offers every key it declares in every build. A key the build
  // reads without declaring never appears in that UI and is stuck at its
  // default, whatever the user does.
  //
  // What the build reads is observed, not matched: `activate` runs, every
  // command it registered is invoked, and the configuration stub records the
  // keys that were actually asked for. A scan for a spelling like
  // `config.get<T>("key")` would answer a different question — which
  // spellings the person who wrote the scan thought of — and renaming the
  // receiver would hide the read.
  it("reads no setting it does not declare", async () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf-8"),
    ) as { contributes: { configuration?: { properties?: Record<string, unknown> } } };
    const declared = Object.keys(pkg.contributes.configuration?.properties ?? {});

    const { activate } = await import("../extension.js");
    await activate({
      subscriptions: [],
      extensionUri: { fsPath: "/ext" },
      secrets: {},
    } as never);

    for (const call of mockRegisterCommand.mock.calls) {
      const handler = call[1] as () => unknown;
      try {
        await handler();
      } catch {
        // A handler that needs more of the editor than this suite stubs has
        // still had its configuration reads recorded up to that point.
      }
    }

    expect(declared.length).toBeGreaterThan(0);
    for (const key of mockConfigReads) {
      expect(declared).toContain(key);
    }
  });

  it("records a configuration read, so an empty result means nothing was read", async () => {
    // The instrument, not the build. Whether a handler reaches its
    // configuration depends on how far it gets before it needs the editor:
    // opening a panel reads nothing, and the turn that does is sent later. So
    // the check above would also pass against a stub that recorded nothing,
    // and this is what rules that out.
    const vscode = await import("vscode");
    vscode.workspace.getConfiguration("__PROJECT_NAME__").get("provider");

    expect(mockConfigReads).toContain("__PROJECT_NAME__.provider");
  });
});
