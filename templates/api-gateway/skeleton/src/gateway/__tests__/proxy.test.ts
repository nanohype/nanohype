import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { proxyRequest } from "../router/proxy.js";
import type { Logger } from "../logger.js";

// ── Proxy Tests ─────────────────────────────────────────────────────
//
// Validates the reverse proxy: request forwarding, response streaming,
// timeout handling, and upstream error handling.
//

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("proxyRequest", () => {
  let logger: Logger;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    logger = createMockLogger();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("forwards a GET request and returns the upstream response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1, name: "test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const request = new Request("http://gateway:8080/api/users/1", {
      method: "GET",
    });

    const result = await proxyRequest(
      "http://users-service:3001",
      "/api/users/1",
      request,
      logger,
    );

    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toBe("application/json");
    expect(result.body).not.toBeNull();
  });

  it("forwards query parameters to the upstream", async () => {
    let capturedUrl = "";
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(new Response("ok", { status: 200 }));
    });

    const request = new Request("http://gateway:8080/api/users?page=2&limit=10", {
      method: "GET",
    });

    await proxyRequest(
      "http://users-service:3001",
      "/api/users",
      request,
      logger,
    );

    expect(capturedUrl).toContain("page=2");
    expect(capturedUrl).toContain("limit=10");
  });

  it("returns 504 on upstream timeout", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise((_resolve, reject) => {
        const err = new DOMException("The operation was aborted", "AbortError");
        setTimeout(() => reject(err), 10);
      });
    });

    const request = new Request("http://gateway:8080/api/slow", {
      method: "GET",
    });

    const result = await proxyRequest(
      "http://slow-service:3001",
      "/api/slow",
      request,
      logger,
      { timeoutMs: 5 },
    );

    expect(result.status).toBe(504);
  });

  it("returns 502 on upstream connection error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const request = new Request("http://gateway:8080/api/down", {
      method: "GET",
    });

    const result = await proxyRequest(
      "http://down-service:3001",
      "/api/down",
      request,
      logger,
    );

    expect(result.status).toBe(502);
  });

  it("applies response header transforms", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "x-internal-header": "secret",
        },
      }),
    );

    const request = new Request("http://gateway:8080/api/data", {
      method: "GET",
    });

    const result = await proxyRequest(
      "http://data-service:3001",
      "/api/data",
      request,
      logger,
      {
        transform: {
          removeResponseHeaders: ["x-internal-header"],
          setResponseHeaders: { "x-gateway": "true" },
        },
      },
    );

    expect(result.headers["x-internal-header"]).toBeUndefined();
    expect(result.headers["x-gateway"]).toBe("true");
  });

  it("strips hop-by-hop headers from the response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "connection": "keep-alive",
          "transfer-encoding": "chunked",
        },
      }),
    );

    const request = new Request("http://gateway:8080/api/test", {
      method: "GET",
    });

    const result = await proxyRequest(
      "http://test-service:3001",
      "/api/test",
      request,
      logger,
    );

    expect(result.headers["connection"]).toBeUndefined();
    expect(result.headers["transfer-encoding"]).toBeUndefined();
  });
});
