"use client";

import { ChatWindow } from "@/components/chat/ChatWindow";

export default function ChatPage() {
  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column" }}>
      <header
        className="bg-frosted"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          borderBottom: "1px solid var(--border)",
          padding: "0.875rem 1.5rem",
          backdropFilter: "blur(20px) saturate(1.3)",
        }}
      >
        <h1 className="text-foreground" style={{ fontSize: "1.0625rem", fontWeight: 600 }}>Chat</h1>
      </header>
      <ChatWindow />
    </main>
  );
}
