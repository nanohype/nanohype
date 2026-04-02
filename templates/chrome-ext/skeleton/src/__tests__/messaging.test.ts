import { describe, it, expect } from "vitest";
import type {
  Message,
  ChatRequest,
  ChatResponse,
  SelectionPayload,
  ExtensionMessage,
} from "../lib/messaging.js";

/**
 * Tests for message type definitions.
 *
 * The messaging module also exports sendChatMessage and sendSelectionMessage,
 * but those call chrome.runtime.sendMessage which is unavailable outside the
 * extension runtime. We test only the pure type contracts here.
 */

describe("message type definitions", () => {
  it("Message conforms to the expected shape", () => {
    const msg: Message = {
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    };

    expect(msg.role).toBe("user");
    expect(msg.content).toBe("hello");
    expect(typeof msg.timestamp).toBe("number");
  });

  it("Message accepts assistant role", () => {
    const msg: Message = {
      role: "assistant",
      content: "hi there",
      timestamp: 1700000000000,
    };

    expect(msg.role).toBe("assistant");
  });

  it("ChatRequest carries an array of messages", () => {
    const req: ChatRequest = {
      messages: [
        { role: "user", content: "What is 2+2?" },
        { role: "assistant", content: "4" },
      ],
    };

    expect(req.messages).toHaveLength(2);
    expect(req.messages[0].role).toBe("user");
    expect(req.messages[1].role).toBe("assistant");
  });

  it("ChatResponse includes content and optional error", () => {
    const success: ChatResponse = { content: "result" };
    expect(success.content).toBe("result");
    expect(success.error).toBeUndefined();

    const failure: ChatResponse = { content: "", error: "rate limited" };
    expect(failure.error).toBe("rate limited");
  });

  it("SelectionPayload carries text and optional url", () => {
    const withUrl: SelectionPayload = {
      text: "selected text",
      url: "https://example.com",
    };
    expect(withUrl.text).toBe("selected text");
    expect(withUrl.url).toBe("https://example.com");

    const withoutUrl: SelectionPayload = { text: "just text" };
    expect(withoutUrl.url).toBeUndefined();
  });

  it("ExtensionMessage discriminates on type field", () => {
    const chatMsg: ExtensionMessage = {
      type: "chat",
      payload: { messages: [{ role: "user", content: "hi" }] },
    };

    const selectionMsg: ExtensionMessage = {
      type: "selection",
      payload: { text: "selected" },
    };

    expect(chatMsg.type).toBe("chat");
    expect(selectionMsg.type).toBe("selection");

    // Discriminated union narrows correctly at runtime
    if (chatMsg.type === "chat") {
      expect(chatMsg.payload.messages).toBeDefined();
    }
    if (selectionMsg.type === "selection") {
      expect(selectionMsg.payload.text).toBe("selected");
    }
  });
});
