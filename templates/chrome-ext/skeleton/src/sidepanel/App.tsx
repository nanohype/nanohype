import { useState, useCallback } from "react";
import { Chat } from "./components/Chat";
import type { Message } from "@/lib/messaging";

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
        const response = await chrome.runtime.sendMessage({
          type: "chat",
          payload: {
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
          },
        });

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
        background: "#ffffff",
      }}
    >
      <header
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e5e5e5",
          fontWeight: 600,
          fontSize: "14px",
        }}
      >
        __EXTENSION_NAME__
      </header>
      <Chat messages={messages} onSend={handleSend} isLoading={isLoading} />
    </div>
  );
}
