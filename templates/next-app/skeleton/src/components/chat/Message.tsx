import type { ChatMessage } from "@/lib/ai/providers/types";

interface MessageProps {
  message: ChatMessage;
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className="animate-fade-in"
      style={{
        display: "flex",
        marginBottom: "1rem",
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        className="shadow-surface"
        style={{
          maxWidth: "80%",
          borderRadius: "6px",
          padding: "0.5rem 1rem",
          fontSize: "0.875rem",
          whiteSpace: "pre-wrap",
          backgroundColor: isUser ? "var(--accent)" : "var(--card)",
          color: isUser ? "var(--accent-foreground)" : "var(--card-foreground)",
          border: isUser ? "none" : "1px solid var(--border)",
        }}
      >
        {message.content}
      </div>
    </div>
  );
}
