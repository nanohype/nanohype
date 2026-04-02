"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Message } from "./Message";
import type { ChatMessage } from "@/lib/ai/providers/types";

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: assistantContent };
          return updated;
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errorMessage}` },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
        {messages.length === 0 && (
          <div
            className="text-dim animate-fade-in"
            style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}
          >
            <p>Send a message to start a conversation.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <Message key={index} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--card)",
          padding: "1rem",
        }}
      >
        <div style={{ display: "flex", maxWidth: "48rem", margin: "0 auto", gap: "0.5rem" }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isStreaming}
            style={{
              flex: 1,
              borderRadius: "6px",
              backgroundColor: "var(--input)",
              border: "1px solid var(--input-border)",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              color: "var(--foreground)",
              transition: "border-color 0.15s ease",
              opacity: isStreaming ? 0.5 : 1,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--accent) 40%, transparent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--input-border)"; }}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="btn-accent"
          >
            {isStreaming ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
