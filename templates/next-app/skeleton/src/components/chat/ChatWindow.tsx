"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/ai/providers/types";
import { Message } from "./Message";

/**
 * A message as the list renders it. The `id` is render state — React needs a
 * stable key across the many re-renders a streamed reply produces — so it lives
 * here rather than on `ChatMessage`, which is the wire type the API route and
 * the model see.
 */
type RenderedMessage = ChatMessage & { id: string };

/** Drop render-only fields before the conversation goes over the wire. */
const toWire = (messages: RenderedMessage[]): ChatMessage[] =>
  messages.map(({ role, content }) => ({ role, content }));

export function ChatWindow() {
  const [messages, setMessages] = useState<RenderedMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Scrolling to the bottom when the list grows is the whole point of this
  // effect. Dropping the dependency would satisfy the rule and break autoscroll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `messages` is the trigger, not a value the body reads
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: RenderedMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toWire(updatedMessages) }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let assistantContent = "";

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;

        setMessages((prev) => {
          const updated = [...prev];
          // Spread the existing entry so the id survives every streamed token —
          // a new id each chunk would remount the bubble mid-stream.
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: assistantContent,
          };
          return updated;
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: `Error: ${errorMessage}` },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
      <div
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        style={{ flex: 1, overflowY: "auto", padding: "1rem" }}
      >
        {messages.length === 0 && (
          <div
            className="text-dim animate-fade-in"
            style={{
              display: "flex",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <p>Send a message to start a conversation.</p>
          </div>
        )}
        {messages.map((message) => (
          <Message key={message.id} message={message} />
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
            aria-label="Message input"
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
            onFocus={(e) => {
              e.currentTarget.style.borderColor =
                "color-mix(in srgb, var(--accent) 40%, transparent)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--input-border)";
            }}
          />
          <button type="submit" disabled={isStreaming || !input.trim()} className="btn-accent">
            {isStreaming ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
