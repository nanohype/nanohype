import type { ChatMessage } from "@/lib/ai/providers/types";

interface MessageProps {
  message: ChatMessage;
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`animate-fade-in mb-4 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`shadow-surface max-w-[80%] whitespace-pre-wrap rounded-md px-4 py-2 text-sm ${
          isUser
            ? "bg-accent text-accent-foreground"
            : "border border-border bg-card text-card-foreground"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
