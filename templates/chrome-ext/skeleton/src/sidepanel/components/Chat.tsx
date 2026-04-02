import { useState, useRef, useEffect } from "react";
import { MessageBubble } from "./Message";
import type { Message } from "@/lib/messaging";

interface ChatProps {
  messages: Message[];
  onSend: (text: string) => void;
  isLoading: boolean;
}

export function Chat({ messages, onSend, isLoading }: ChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    onSend(trimmed);
  };

  return (
    <>
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "#999",
              marginTop: "40px",
              fontSize: "13px",
            }}
          >
            Send a message to get started.
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {isLoading && (
          <div style={{ color: "#999", fontSize: "13px", padding: "4px 0" }}>
            Thinking...
          </div>
        )}
      </div>
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: "8px",
          padding: "12px 16px",
          borderTop: "1px solid #e5e5e5",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid #d0d0d0",
            fontSize: "13px",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            background: isLoading || !input.trim() ? "#ccc" : "#4A90D9",
            color: "#fff",
            fontSize: "13px",
            cursor: isLoading || !input.trim() ? "default" : "pointer",
            fontWeight: 500,
          }}
        >
          Send
        </button>
      </form>
    </>
  );
}
