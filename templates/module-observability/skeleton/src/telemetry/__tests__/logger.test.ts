import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trace, context, SpanContext, TraceFlags } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { logger } from "../logger.js";

// Without a registered context manager the @opentelemetry/api default is a
// NOOP that silently drops `context.with(...)` scopes, so `context.active()`
// never sees the wrapped span. Register the async-hooks manager globally so
// the trace-propagation assertions below actually exercise the wiring.
const contextManager = new AsyncLocalStorageContextManager();

describe("structured logger", () => {
  beforeEach(() => {
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    context.disable();
    contextManager.disable();
    vi.restoreAllMocks();
  });

  it("emits structured JSON on info level", () => {
    logger.info("request handled", { path: "/health", durationMs: 12 });

    expect(console.log).toHaveBeenCalledOnce();

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const entry = JSON.parse(output);

    expect(entry.level).toBe("info");
    expect(entry.message).toBe("request handled");
    expect(entry.path).toBe("/health");
    expect(entry.durationMs).toBe(12);
    expect(entry.timestamp).toBeDefined();
  });

  it("routes error level to console.error", () => {
    logger.error("something broke", { code: 500 });

    expect(console.error).toHaveBeenCalledOnce();

    const output = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const entry = JSON.parse(output);

    expect(entry.level).toBe("error");
    expect(entry.message).toBe("something broke");
    expect(entry.code).toBe(500);
  });

  it("routes warn level to console.warn", () => {
    logger.warn("slow query");

    expect(console.warn).toHaveBeenCalledOnce();

    const output = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const entry = JSON.parse(output);

    expect(entry.level).toBe("warn");
  });

  it("routes debug level to console.debug", () => {
    logger.debug("cache hit", { key: "users:123" });

    expect(console.debug).toHaveBeenCalledOnce();

    const output = (console.debug as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const entry = JSON.parse(output);

    expect(entry.level).toBe("debug");
    expect(entry.key).toBe("users:123");
  });

  it("includes trace context when an active span exists", () => {
    const spanContext: SpanContext = {
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceFlags: TraceFlags.SAMPLED,
    };

    // Create a non-recording span with the test span context
    const span = trace.wrapSpanContext(spanContext);
    const ctx = trace.setSpan(context.active(), span);

    context.with(ctx, () => {
      logger.info("traced request");
    });

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const entry = JSON.parse(output);

    expect(entry.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    expect(entry.spanId).toBe("b7ad6b7169203331");
  });

  it("omits trace context fields when no active span exists", () => {
    logger.info("no trace");

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const entry = JSON.parse(output);

    expect(entry.traceId).toBeUndefined();
    expect(entry.spanId).toBeUndefined();
  });
});
