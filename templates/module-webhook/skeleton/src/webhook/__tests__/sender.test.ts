import { describe, it, expect, vi, beforeEach } from "vitest";

// Import signature providers to trigger self-registration
import "../signatures/hmac-sha256.js";
import { createWebhookSender } from "../sender.js";

describe("webhook sender", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a POST request with signature header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", mockFetch);

    const sender = createWebhookSender({
      secret: "test-secret",
      signatureMethod: "hmac-sha256",
    });

    const result = await sender.send("https://example.com/hook", {
      event: "test.event",
      payload: { key: "value" },
    });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.attempts).toBe(1);

    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://example.com/hook");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers["x-signature"]).toBeDefined();
    expect(typeof opts.headers["x-signature"]).toBe("string");
  });

  it("retries on 5xx errors with exponential backoff", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const sender = createWebhookSender({
      secret: "test-secret",
      signatureMethod: "hmac-sha256",
      maxRetries: 3,
      baseDelay: 1, // 1ms for fast tests
    });

    const result = await sender.send("https://example.com/hook", {
      event: "test.event",
      payload: {},
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 4xx errors", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });
    vi.stubGlobal("fetch", mockFetch);

    const sender = createWebhookSender({
      secret: "test-secret",
      signatureMethod: "hmac-sha256",
      maxRetries: 3,
      baseDelay: 1,
    });

    const result = await sender.send("https://example.com/hook", {
      event: "test.event",
      payload: {},
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.attempts).toBe(1);
    expect(result.error).toBe("HTTP 400");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("retries on network errors", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const sender = createWebhookSender({
      secret: "test-secret",
      signatureMethod: "hmac-sha256",
      maxRetries: 3,
      baseDelay: 1,
    });

    const result = await sender.send("https://example.com/hook", {
      event: "test.event",
      payload: {},
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxRetries and returns failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal("fetch", mockFetch);

    const sender = createWebhookSender({
      secret: "test-secret",
      signatureMethod: "hmac-sha256",
      maxRetries: 2,
      baseDelay: 1,
    });

    const result = await sender.send("https://example.com/hook", {
      event: "test.event",
      payload: {},
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.attempts).toBe(3); // initial + 2 retries
    expect(result.error).toBe("HTTP 500");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("includes custom headers in the request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", mockFetch);

    const sender = createWebhookSender({
      secret: "test-secret",
      signatureMethod: "hmac-sha256",
    });

    await sender.send(
      "https://example.com/hook",
      { event: "test.event", payload: {} },
      { headers: { "X-Custom": "my-value" } },
    );

    const [, opts] = mockFetch.mock.calls[0]!;
    expect(opts.headers["X-Custom"]).toBe("my-value");
  });

  it("per-call options override sender defaults", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal("fetch", mockFetch);

    const sender = createWebhookSender({
      secret: "test-secret",
      signatureMethod: "hmac-sha256",
      maxRetries: 5,
      baseDelay: 1,
    });

    const result = await sender.send(
      "https://example.com/hook",
      { event: "test.event", payload: {} },
      { maxRetries: 0 },
    );

    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(1); // no retries
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});
