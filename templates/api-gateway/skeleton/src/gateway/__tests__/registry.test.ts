import { describe, it, expect, vi } from "vitest";
import { createGateway } from "../index.js";
import type { GatewayConfig } from "../types.js";

// ── Registry Tests ──────────────────────────────────────────────────
//
// Validates the gateway route registry lifecycle: route matching,
// health endpoint, 404 on unknown routes, and shutdown cleanup.
// Uses the createGateway factory to build an app instance for testing.
//

// Suppress standalone server boot side effects during tests
vi.mock("@hono/node-server", () => ({
  serve: vi.fn(() => ({
    close: vi.fn((cb: () => void) => cb()),
  })),
}));

function createTestConfig(overrides?: Partial<GatewayConfig>): GatewayConfig {
  return {
    port: 9999,
    routes: [
      {
        path: "/api/users/*",
        methods: ["GET", "POST"],
        upstream: "http://users:3001",
      },
      {
        path: "/api/posts/*",
        methods: [],
        upstream: "http://posts:3002",
        rateLimit: { limit: 10, window: 60 },
      },
    ],
    healthCheckEnabled: false,
    ...overrides,
  };
}

describe("createGateway", () => {
  it("creates a gateway with the configured routes", () => {
    const { app, shutdown } = createGateway(createTestConfig());
    expect(app).toBeDefined();
    shutdown();
  });

  it("responds to /health with status ok", async () => {
    const { app, shutdown } = createGateway(createTestConfig());

    const response = await app.request("/health");
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("__PROJECT_NAME__");
    shutdown();
  });

  it("returns 404 for unmatched routes", async () => {
    const { app, shutdown } = createGateway(createTestConfig());

    const response = await app.request("/api/billing/123");
    expect(response.status).toBe(404);

    const body = await response.json() as Record<string, unknown>;
    expect(body.error).toBe("Not Found");
    shutdown();
  });

  it("shutdown cleans up health checker and circuit breakers", () => {
    const { shutdown } = createGateway(createTestConfig());

    // Should not throw
    expect(() => shutdown()).not.toThrow();
  });
});
