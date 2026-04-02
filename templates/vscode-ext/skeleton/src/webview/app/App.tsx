import { useState, useCallback } from "react";

// Acquire the VS Code API for communicating with the extension host
const vscode = acquireVsCodeApi();

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Send to the extension host via postMessage
    vscode.postMessage({ type: "chat", payload: text });
  }, [input]);

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
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: "8px",
              padding: "6px 10px",
              borderRadius: "4px",
              backgroundColor:
                msg.role === "user"
                  ? "var(--vscode-inputValidation-infoBackground)"
                  : "var(--vscode-editor-background)",
            }}
          >
            <strong>{msg.role === "user" ? "You" : "Assistant"}: </strong>
            {msg.content}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
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
          onClick={sendMessage}
          style={{
            padding: "6px 16px",
            backgroundColor: "var(--vscode-button-background)",
            color: "var(--vscode-button-foreground)",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
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
