import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeChatHandler } from "../ai/chat-session";
import type { AiClientOptions } from "../ai/client";
import { assistantTurnFor, handleWebviewMessage } from "../webview/protocol";

/**
 * The extension host and the webview run in two processes and communicate by
 * `postMessage`, which type-checks nothing. These cover the routing between
 * them without a running VS Code: `handleWebviewMessage` takes its host
 * surfaces as arguments, and `makeChatHandler` takes its configuration and
 * client factory the same way.
 */

function deps(overrides: Partial<Parameters<typeof handleWebviewMessage>[1]> = {}) {
  return {
    chat: vi.fn(async () => "an answer"),
    post: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    ...overrides,
  };
}

describe("handleWebviewMessage", () => {
  it("answers a chat turn with the reply the handler produced", async () => {
    const d = deps();

    await handleWebviewMessage({ type: "chat", payload: "hello" }, d);

    expect(d.chat).toHaveBeenCalledWith("hello");
    expect(d.post).toHaveBeenCalledWith({ type: "reply", payload: "an answer" });
  });

  it("answers a failed chat turn rather than leaving it open", async () => {
    // The webview holds a turn pending until the host answers, so a failure
    // that posted nothing would hang the panel with no way back.
    const d = deps({
      chat: vi.fn(async () => {
        throw new Error("provider refused");
      }),
    });

    await handleWebviewMessage({ type: "chat", payload: "hello" }, d);

    expect(d.post).toHaveBeenCalledWith({ type: "chatError", payload: "provider refused" });
  });

  it("carries a non-Error rejection through as text", async () => {
    const d = deps({
      chat: vi.fn(async () => {
        throw "a bare string";
      }),
    });

    await handleWebviewMessage({ type: "chat", payload: "hello" }, d);

    expect(d.post).toHaveBeenCalledWith({ type: "chatError", payload: "a bare string" });
  });

  it("treats a missing payload as an empty turn", async () => {
    const d = deps();

    await handleWebviewMessage({ type: "chat" }, d);

    expect(d.chat).toHaveBeenCalledWith("");
  });

  it("routes info and error to the matching host notification", async () => {
    const d = deps();

    await handleWebviewMessage({ type: "info", payload: "saved" }, d);
    await handleWebviewMessage({ type: "error", payload: "broke" }, d);
    await handleWebviewMessage({ type: "info" }, d);

    expect(d.showInformationMessage).toHaveBeenNthCalledWith(1, "saved");
    expect(d.showErrorMessage).toHaveBeenCalledWith("broke");
    expect(d.showInformationMessage).toHaveBeenNthCalledWith(2, "");
  });

  it("reports a message type nothing routes instead of dropping it", async () => {
    // A dropped message is what makes a wired-looking feature do nothing.
    const d = deps();

    await handleWebviewMessage({ type: "somethingNobodyWired", payload: "x" }, d);

    expect(d.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("no handler for webview message 'somethingNobodyWired'"),
    );
    expect(d.post).not.toHaveBeenCalled();
  });
});

describe("makeChatHandler", () => {
  const client = { chat: vi.fn(async () => "an answer") };

  function handlerDeps(overrides = {}) {
    return {
      getConfiguration: vi.fn(
        (): AiClientOptions => ({
          provider: "bedrock",
          model: "a-model",
          awsProfile: "a-profile",
          awsRegion: "a-region",
        }),
      ),
      createClient: vi.fn(() => client),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    client.chat.mockResolvedValue("an answer");
  });

  it("sends the turn to the configured provider with the configured settings", async () => {
    const d = handlerDeps();

    await expect(makeChatHandler(d)("hello")).resolves.toBe("an answer");

    expect(d.createClient).toHaveBeenCalledWith({
      provider: "bedrock",
      model: "a-model",
      awsProfile: "a-profile",
      awsRegion: "a-region",
    });
    expect(client.chat).toHaveBeenCalledWith([{ role: "user", content: "hello" }]);
  });

  it("reads the settings again on every turn, so a change applies to the next one", async () => {
    const d = handlerDeps();
    const chat = makeChatHandler(d);

    await chat("first");
    d.getConfiguration.mockReturnValue({ provider: "bedrock", model: "another-model" });
    await chat("second");

    expect(d.getConfiguration).toHaveBeenCalledTimes(2);
    expect(d.createClient).toHaveBeenLastCalledWith({
      provider: "bedrock",
      model: "another-model",
    });
  });

  it("builds a real client when no factory is injected", async () => {
    // The default arm constructs AiClient, which resolves the provider through
    // the registry before it sends anything. Naming a provider the registry
    // does not hold stops the turn there, so this reaches the real constructor
    // without a network call — a registered name here would send a live
    // request under whatever credentials the test machine holds.
    const d = handlerDeps({
      createClient: undefined,
      getConfiguration: () => ({ provider: "no-such-provider" }),
    });

    await expect(makeChatHandler(d)("hello")).rejects.toThrow(/Unknown AI provider/);
  });
});

describe("assistantTurnFor", () => {
  it("turns a reply into an assistant message", () => {
    expect(assistantTurnFor({ type: "reply", payload: "an answer" })).toEqual({
      content: "an answer",
      failed: false,
    });
  });

  it("turns a chat error into a failed message the reader can see", () => {
    // The pending turn ends on either shape. A failure that produced nothing
    // would leave the webview waiting with no way back.
    expect(assistantTurnFor({ type: "chatError", payload: "provider refused" })).toEqual({
      content: "Request failed: provider refused",
      failed: true,
    });
  });

  it("reads a missing payload as an empty answer rather than throwing", () => {
    expect(assistantTurnFor({ type: "reply" })).toEqual({ content: "", failed: false });
  });

  it("ignores anything that is not a turn", () => {
    // The webview shares its message event with whatever else the host posts.
    for (const other of [null, undefined, "a string", 7, {}, { type: "info" }]) {
      expect(assistantTurnFor(other)).toBeNull();
    }
  });
});
