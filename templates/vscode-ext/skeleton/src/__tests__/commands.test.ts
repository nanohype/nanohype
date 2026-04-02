import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("vscode", () => ({
  window: {
    showInputBox: (...args: unknown[]) => mockShowInputBox(...args),
    showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
  },
  commands: {
    registerCommand: (...args: unknown[]) => mockRegisterCommand(...args),
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

    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      "__EXTENSION_NAME__: hello world",
    );
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
