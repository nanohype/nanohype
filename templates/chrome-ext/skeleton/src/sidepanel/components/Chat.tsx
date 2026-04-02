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
          gap: "6px",
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "var(--muted-foreground)",
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
          <div
            style={{
              color: "var(--accent)",
              fontSize: "12px",
              padding: "4px 0",
              letterSpacing: "0.02em",
            }}
          >
            Thinking...
          </div>
        )}
      </div>
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: "8px",
          padding: "10px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--card)",
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
            border: "1px solid var(--input-border)",
            background: "var(--input)",
            color: "var(--foreground)",
            fontSize: "13px",
            outline: "none",
            transition: "border-color 0.15s var(--ease-out)",
          }}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = "var(--accent)")
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = "var(--input-border)")
          }
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            background:
              isLoading || !input.trim()
                ? "var(--muted)"
                : "var(--accent)",
            color:
              isLoading || !input.trim()
                ? "var(--dim)"
                : "var(--accent-foreground)",
            fontSize: "13px",
            cursor: isLoading || !input.trim() ? "default" : "pointer",
            fontWeight: 600,
            transition:
              "filter 0.15s var(--ease-out), transform 0.1s var(--ease-spring)",
          }}
          onMouseEnter={(e) => {
            if (!isLoading && input.trim())
              e.currentTarget.style.filter = "brightness(1.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "brightness(1)";
            e.currentTarget.style.transform = "scale(1)";
          }}
          onMouseDown={(e) => {
            if (!isLoading && input.trim())
              e.currentTarget.style.transform = "scale(0.96)";
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          Send
        </button>
      </form>
    </>
  );
}
