import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the providers module before importing the route
vi.mock("@/lib/ai/providers", () => ({
  getProvider: vi.fn(),
}));

vi.mock("@/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getProvider } from "@/lib/ai/providers";

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when messages array is missing", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const request = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("error", "messages array is required");
  });

  it("returns 400 when messages array is empty", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const request = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(400);
  });

  it("streams response from AI provider", async () => {
    const mockProvider = {
      defaultModel: "test-model",
      sendMessage: vi.fn(),
      streamMessage: vi.fn(async function* () {
        yield "Hello";
        yield " world";
      }),
    };

    vi.mocked(getProvider).mockReturnValue(mockProvider);

    const { POST } = await import("@/app/api/chat/route");

    const request = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    const response = await POST(request as any);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");

    const text = await response.text();
    expect(text).toBe("Hello world");
  });
});
