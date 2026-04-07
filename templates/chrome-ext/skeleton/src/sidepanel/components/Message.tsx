import type { Message } from "@/lib/messaging";

interface MessageBubbleProps {
  message: Message;
}

/**
 * Renders a single chat message with role-based styling.
 * Supports simple markdown: paragraphs and fenced code blocks.
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        maxWidth: "100%",
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          padding: "8px 12px",
          borderRadius: "6px",
          background: isUser
            ? "color-mix(in srgb, var(--accent) 10%, transparent)"
            : "var(--card)",
          color: "var(--foreground)",
          fontSize: "13px",
          lineHeight: "1.5",
          wordBreak: "break-word",
          border: isUser
            ? "1px solid color-mix(in srgb, var(--accent) 15%, transparent)"
            : "1px solid var(--border)",
        }}
      >
        {renderContent(message.content)}
      </div>
      <span
        style={{
          fontSize: "10px",
          color: "var(--dim)",
          marginTop: "2px",
          padding: "0 4px",
        }}
      >
        {time}
      </span>
    </div>
  );
}

/**
 * Simple markdown renderer for paragraphs and fenced code blocks.
 */
function renderContent(content: string) {
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      parts.push(
        ...renderParagraphs(content.slice(lastIndex, match.index), parts.length),
      );
    }
    // Code block
    parts.push(
      <pre
        key={`code-${parts.length}`}
        style={{
          background: "var(--muted)",
          padding: "8px",
          borderRadius: "4px",
          fontSize: "12px",
          fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
          overflowX: "auto",
          margin: "4px 0",
          whiteSpace: "pre-wrap",
          border: "1px solid var(--border)",
          color: "var(--foreground)",
        }}
      >
        <code>{match[1]}</code>
      </pre>,
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last code block
  if (lastIndex < content.length) {
    parts.push(...renderParagraphs(content.slice(lastIndex), parts.length));
  }

  return parts.length > 0 ? parts : content;
}

function renderParagraphs(text: string, keyOffset: number): React.ReactNode[] {
  return text
    .split("\n\n")
    .filter((p) => p.trim())
    .map((paragraph, i) => (
      <p key={`p-${keyOffset}-${i}`} style={{ margin: "2px 0" }}>
        {paragraph.trim()}
      </p>
    ));
}
