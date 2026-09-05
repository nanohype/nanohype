import { useCallback, useEffect, useState } from "react";
import { assistantTurnFor } from "../protocol";

// Acquire the VS Code API for communicating with the extension host
const vscode = acquireVsCodeApi();

interface Message {
  /** Stable identity for list rendering — index keys remount on every append. */
  id: string;
  role: "user" | "assistant";
  content: string;
  /** A reply that reports a failed turn, styled as one rather than as an answer. */
  failed?: boolean;
}

export function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  // The host answers every chat turn with `reply` or `chatError`. Without this
  // listener the turn has nowhere to land: the message would be sent, the host
  // would answer, and the panel would sit on the user's own bubble.
  useEffect(() => {
    function onHostMessage(event: MessageEvent<unknown>) {
      const turn = assistantTurnFor(event.data);
      if (!turn) return;

      setPending(false);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", ...turn }]);
    }

    window.addEventListener("message", onHostMessage);
    return () => window.removeEventListener("message", onHostMessage);
  }, []);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || pending) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setPending(true);

    // Send to the extension host via postMessage
    vscode.postMessage({ type: "chat", payload: text });
  }, [input, pending]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  return (
    <div style={{ padding: "16px", fontFamily: "var(--vscode-font-family)" }}>
      <h2 style={{ color: "var(--vscode-foreground)" }}>__EXTENSION_NAME__</h2>

      <div
        style={{
          maxHeight: "400px",
          overflowY: "auto",
          marginBottom: "12px",
          border: "1px solid var(--vscode-panel-border)",
          borderRadius: "4px",
          padding: "8px",
        }}
      >
        {messages.length === 0 && (
          <p style={{ color: "var(--vscode-descriptionForeground)" }}>
            No messages yet. Type something below to get started.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              marginBottom: "8px",
              padding: "6px 10px",
              borderRadius: "4px",
              backgroundColor: msg.failed
                ? "var(--vscode-inputValidation-errorBackground)"
                : msg.role === "user"
                  ? "var(--vscode-inputValidation-infoBackground)"
                  : "var(--vscode-editor-background)",
            }}
          >
            <strong>{msg.role === "user" ? "You" : "Assistant"}: </strong>
            {msg.content}
          </div>
        ))}
        {/* An answer takes longer than the second past which a wait needs
            feedback, so the turn says it is in flight rather than looking
            like nothing happened. */}
        {pending && (
          <div
            aria-live="polite"
            style={{ padding: "6px 10px", color: "var(--vscode-descriptionForeground)" }}
          >
            Waiting for a reply...
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={pending}
          placeholder="Type a message..."
          style={{
            flex: 1,
            padding: "6px 10px",
            border: "1px solid var(--vscode-input-border)",
            backgroundColor: "var(--vscode-input-background)",
            color: "var(--vscode-input-foreground)",
            borderRadius: "4px",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={pending}
          style={{
            padding: "6px 16px",
            backgroundColor: "var(--vscode-button-background)",
            color: "var(--vscode-button-foreground)",
            border: "none",
            borderRadius: "4px",
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// Type declaration for the VS Code webview API
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
