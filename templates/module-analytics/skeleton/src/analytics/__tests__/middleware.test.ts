import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHonoAnalytics } from "../middleware/hono.js";
import { createExpressAnalytics } from "../middleware/express.js";
import type { AnalyticsProvider } from "../providers/types.js";

// ── Middleware Tests ─────────────────────────────────────────────
//
// Validates request event shape, status codes, and duration for
// both Hono and Express middleware factories.
//

function stubProvider(): AnalyticsProvider & { tracked: Record<string, unknown>[] } {
  const tracked: Record<string, unknown>[] = [];

  return {
    name: "stub",
    tracked,
    async init() {},
    async track(event) {
      tracked.push(event);
    },
    async identify() {},
    async group() {},
    async page() {},
    async flush() {},
    async close() {},
  };
}

describe("hono analytics middleware", () => {
  let provider: ReturnType<typeof stubProvider>;

  beforeEach(() => {
    provider = stubProvider();
  });

  it("tracks request events with correct shape", async () => {
    const middleware = createHonoAnalytics(provider);

    const ctx = {
      req: {
        method: "GET",
        path: "/api/users",
        header: (name: string) => {
          if (name === "user-agent") return "TestAgent/1.0";
          return undefined;
        },
      },
      res: { status: 200 },
    };

    await middleware(ctx, async () => {});

    // Allow microtask for non-blocking track call
    await new Promise((r) => setTimeout(r, 0));

    expect(provider.tracked).toHaveLength(1);
    const event = provider.tracked[0] as Record<string, unknown>;
    expect(event.event).toBe("request");

    const props = event.properties as Record<string, unknown>;
    expect(props.method).toBe("GET");
    expect(props.path).toBe("/api/users");
    expect(props.statusCode).toBe(200);
    expect(typeof props.durationMs).toBe("number");
    expect(props.userAgent).toBe("TestAgent/1.0");
  });

  it("uses custom event name", async () => {
    const middleware = createHonoAnalytics(provider, { eventName: "http_request" });

    const ctx = {
      req: { method: "POST", path: "/", header: () => undefined },
      res: { status: 201 },
    };

    await middleware(ctx, async () => {});
    await new Promise((r) => setTimeout(r, 0));

    expect((provider.tracked[0] as Record<string, unknown>).event).toBe("http_request");
  });

  it("captures error status codes", async () => {
    const middleware = createHonoAnalytics(provider);

    const ctx = {
      req: { method: "GET", path: "/fail", header: () => undefined },
      res: { status: 500 },
    };

    await middleware(ctx, async () => {});
    await new Promise((r) => setTimeout(r, 0));

    const props = (provider.tracked[0] as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props.statusCode).toBe(500);
  });
});

describe("express analytics middleware", () => {
  let provider: ReturnType<typeof stubProvider>;

  beforeEach(() => {
    provider = stubProvider();
  });

  it("tracks request events on response finish", async () => {
    const middleware = createExpressAnalytics(provider);

    let finishCallback: (() => void) | undefined;
    const req = {
      method: "POST",
      path: "/api/orders",
      headers: { "user-agent": "TestAgent/2.0" },
    };
    const res = {
      statusCode: 201,
      on(event: string, listener: () => void) {
        if (event === "finish") finishCallback = listener;
      },
    };

    middleware(req, res, () => {});

    // Simulate response finish
    finishCallback!();

    // Allow microtask for non-blocking track call
    await new Promise((r) => setTimeout(r, 0));

    expect(provider.tracked).toHaveLength(1);
    const event = provider.tracked[0] as Record<string, unknown>;
    expect(event.event).toBe("request");

    const props = event.properties as Record<string, unknown>;
    expect(props.method).toBe("POST");
    expect(props.path).toBe("/api/orders");
    expect(props.statusCode).toBe(201);
    expect(typeof props.durationMs).toBe("number");
    expect(props.userAgent).toBe("TestAgent/2.0");
  });

  it("records duration between request start and finish", async () => {
    const middleware = createExpressAnalytics(provider);

    let finishCallback: (() => void) | undefined;
    const req = { method: "GET", path: "/", headers: {} };
    const res = {
      statusCode: 200,
      on(event: string, listener: () => void) {
        if (event === "finish") finishCallback = listener;
      },
    };

    middleware(req, res, () => {});

    // Simulate some processing time
    const start = performance.now();
    while (performance.now() - start < 1) {
      // busy wait for at least 1ms
    }

    finishCallback!();
    await new Promise((r) => setTimeout(r, 0));

    const props = (provider.tracked[0] as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props.durationMs).toBeGreaterThanOrEqual(0);
  });
});
