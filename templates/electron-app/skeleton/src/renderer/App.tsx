import { useState, useCallback } from "react";
import { Chat } from "./components/Chat";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/**
 * Root component for the __PROJECT_NAME__ renderer.
 *
 * Manages conversation state and sends messages to the main process
 * via the electronAPI bridge exposed in the preload script.
 */
export function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = useCallback(
    async (text: string) => {
      const userMessage: Message = {
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const chatHistory = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await window.electronAPI.sendMessage(chatHistory);

        if (response?.error) {
          throw new Error(response.error);
        }

        const assistantMessage: Message = {
          role: "assistant",
          content: response?.content ?? "No response received.",
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const errorMessage: Message = {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Something went wrong."}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--background)",
      }}
    >
      <header
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          fontWeight: 600,
          fontSize: "13px",
          letterSpacing: "-0.015em",
          color: "var(--foreground)",
          background: "var(--card)",
          WebkitAppRegion: "drag",
        }}
      >
        __PROJECT_NAME__
      </header>
      <Chat messages={messages} onSend={handleSend} isLoading={isLoading} />
    </div>
  );
}

// Type declaration for the preload bridge
declare global {
  interface Window {
    electronAPI: {
      sendMessage: (
        messages: Array<{ role: string; content: string }>,
        provider?: string,
        model?: string,
      ) => Promise<{ content: string; error?: string }>;
    };
  }
}
