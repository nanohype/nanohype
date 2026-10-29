import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerIpcHandlers } from "../main/ipc-handlers.js";
import type { AiProvider, ChatMessage } from "../main/providers/types.js";

/**
 * Tests for the provider registry and IPC handler logic.
 *
 * The registry uses module-level state (a Map), so we re-import
 * a fresh module for each test to avoid cross-test pollution.
 */

async function freshRegistry() {
  const mod = await import("../main/providers/registry.js");
  mod._clearRegistry();
  return mod;
}

function stubProvider(overrides?: Partial<AiProvider>): AiProvider {
  return {
    defaultModel: "test-model",
    sendMessage: async () => "stub response",
    ...overrides,
  };
}

describe("provider registry", () => {
  beforeEach(async () => {
    const mod = await import("../main/providers/registry.js");
    mod._clearRegistry();
  });

  it("registers a factory without throwing", async () => {
    const { registerProvider, listProviders } = await freshRegistry();
    const provider = stubProvider();

    expect(() => registerProvider("test", () => provider)).not.toThrow();
    expect(listProviders()).toContain("test");
  });

  it("retrieves a provider by name from its factory", async () => {
    const { registerProvider, getProvider } = await freshRegistry();

    registerProvider("custom", () => stubProvider({ defaultModel: "custom-model" }));

    const result = getProvider("custom");
    expect(result.defaultModel).toBe("custom-model");
  });

  it("throws with a helpful message for an unknown provider", async () => {
    const { registerProvider, getProvider } = await freshRegistry();
    registerProvider("bedrock", () => stubProvider());
    registerProvider("custom", () => stubProvider());

    expect(() => getProvider("missing")).toThrowError(/Unknown AI provider: "missing"/);
    expect(() => getProvider("missing")).toThrowError(/Available: bedrock, custom/);
  });

  it("lists all registered provider names", async () => {
    const { registerProvider, listProviders } = await freshRegistry();

    registerProvider("bedrock", () => stubProvider());
    registerProvider("custom", () => stubProvider());

    const names = listProviders();
    expect(names).toEqual(expect.arrayContaining(["bedrock", "custom"]));
    expect(names).toHaveLength(2);
  });

  it("returns a fresh instance on each getProvider call", async () => {
    const { registerProvider, getProvider } = await freshRegistry();

    registerProvider("test", () => stubProvider({ defaultModel: "fresh" }));

    const a = getProvider("test");
    const b = getProvider("test");
    expect(a).not.toBe(b);
    expect(a.defaultModel).toBe("fresh");
  });
});

/** An IpcMain that keeps the handler registered for each channel. */
function fakeIpcMain() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, payload: unknown) => unknown>();
  const ipcMain = {
    handle: (channel: string, handler: (event: IpcMainInvokeEvent, payload: unknown) => unknown) =>
      handlers.set(channel, handler),
  } as unknown as IpcMain;
  const invoke = (channel: string, payload: unknown) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`no handler for ${channel}`);
    return handler({} as IpcMainInvokeEvent, payload);
  };
  return { ipcMain, invoke };
}

describe("ai:send-message handler", () => {
  const conversation: ChatMessage[] = [{ role: "user", content: "Hello" }];

  afterEach(async () => {
    vi.unstubAllEnvs();
    const mod = await import("../main/providers/registry.js");
    mod._clearRegistry();
  });

  it("calls the provider the payload names with the conversation and model", async () => {
    const { registerProvider } = await freshRegistry();
    const calls: Array<{ messages: ChatMessage[]; model?: string }> = [];
    registerProvider("custom", () =>
      stubProvider({
        sendMessage: async (messages, model) => {
          calls.push({ messages, model });
          return "a reply";
        },
      }),
    );
    const { ipcMain, invoke } = fakeIpcMain();
    registerIpcHandlers(ipcMain);

    const reply = await invoke("ai:send-message", {
      messages: conversation,
      provider: "custom",
      model: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    });

    expect(reply).toEqual({ content: "a reply" });
    expect(calls).toEqual([
      { messages: conversation, model: "us.anthropic.claude-haiku-4-5-20251001-v1:0" },
    ]);
  });

  it("falls back to LLM_PROVIDER when the payload names no provider", async () => {
    const { registerProvider } = await freshRegistry();
    registerProvider("custom", () => stubProvider({ sendMessage: async () => "from custom" }));
    vi.stubEnv("LLM_PROVIDER", "custom");
    const { ipcMain, invoke } = fakeIpcMain();
    registerIpcHandlers(ipcMain);

    expect(await invoke("ai:send-message", { messages: conversation })).toEqual({
      content: "from custom",
    });
  });

  it("answers a provider failure as an error the renderer shows", async () => {
    const { registerProvider } = await freshRegistry();
    registerProvider("custom", () =>
      stubProvider({
        sendMessage: async () => {
          throw new Error("AccessDeniedException: not authorized");
        },
      }),
    );
    const { ipcMain, invoke } = fakeIpcMain();
    registerIpcHandlers(ipcMain);

    expect(await invoke("ai:send-message", { messages: conversation, provider: "custom" })).toEqual(
      { content: "", error: "AccessDeniedException: not authorized" },
    );
    expect(
      await invoke("ai:send-message", { messages: conversation, provider: "missing" }),
    ).toMatchObject({
      content: "",
      error: expect.stringMatching(/Unknown AI provider: "missing"/),
    });
  });
});

describe("IPC message shape", () => {
  it("defines the expected send-message payload shape", () => {
    const payload = {
      messages: [
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi there" },
      ],
      provider: "bedrock",
      model: "us.anthropic.claude-sonnet-5",
    };

    expect(payload.messages).toHaveLength(2);
    expect(payload.messages[0].role).toBe("user");
    expect(payload.provider).toBe("bedrock");
  });

  it("accepts payload without optional fields", () => {
    const payload = {
      messages: [{ role: "user" as const, content: "Hello" }],
    };

    expect(payload.messages).toHaveLength(1);
    expect(payload).not.toHaveProperty("provider");
    expect(payload).not.toHaveProperty("model");
  });
});
