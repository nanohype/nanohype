// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The webview half of the chat turn. `assistantTurnFor` decides what a host
 * message means; this covers the wiring around it — that the component
 * subscribes to the host at all, holds the turn open until an answer arrives,
 * and stops holding it when one does. A component that never subscribes
 * passes every test of the decision function and still shows the reader
 * nothing.
 */

const postMessage = vi.fn();

// The webview API is injected by the extension host, not imported.
vi.stubGlobal("acquireVsCodeApi", () => ({
  postMessage,
  getState: () => undefined,
  setState: () => undefined,
}));

const { App } = await import("../webview/app/App");

beforeEach(() => {
  postMessage.mockClear();
});

afterEach(cleanup);

/** Type a message and press Send, as a reader would. */
function send(text: string) {
  fireEvent.change(screen.getByPlaceholderText("Type a message..."), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

/** What the extension host posts back into the webview. */
function hostPosts(data: unknown) {
  fireEvent(window, Object.assign(new MessageEvent("message", { data })));
}

describe("App", () => {
  it("sends a typed message to the host", () => {
    render(<App />);

    send("hello");

    expect(postMessage).toHaveBeenCalledWith({ type: "chat", payload: "hello" });
    expect(screen.getByText("hello")).toBeDefined();
  });

  it("renders the host's reply, which requires listening for one", () => {
    render(<App />);
    send("hello");

    hostPosts({ type: "reply", payload: "an answer" });

    expect(screen.getByText("an answer")).toBeDefined();
  });

  it("holds the turn open until the host answers", () => {
    render(<App />);
    send("hello");

    expect(screen.getByText("Waiting for a reply...")).toBeDefined();
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);

    hostPosts({ type: "reply", payload: "an answer" });

    expect(screen.queryByText("Waiting for a reply...")).toBeNull();
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", false);
  });

  it("ends a failed turn with the failure shown, not with silence", () => {
    render(<App />);
    send("hello");

    hostPosts({ type: "chatError", payload: "provider refused" });

    expect(screen.getByText(/provider refused/)).toBeDefined();
    expect(screen.queryByText("Waiting for a reply...")).toBeNull();
  });

  it("ignores host messages that are not a chat answer", () => {
    render(<App />);
    send("hello");

    hostPosts({ type: "somethingElse", payload: "x" });

    // Still pending: an unrelated message must not end the turn.
    expect(screen.getByText("Waiting for a reply...")).toBeDefined();
  });

  it("refuses to send while a turn is open", () => {
    render(<App />);
    send("hello");
    postMessage.mockClear();

    send("again");

    expect(postMessage).not.toHaveBeenCalled();
  });

  it("sends nothing for whitespace", () => {
    render(<App />);

    send("   ");

    expect(postMessage).not.toHaveBeenCalled();
  });
});
