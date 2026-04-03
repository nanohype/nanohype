import { describe, it, expect } from "vitest";
import { Hono } from "hono";

// ── Health Endpoint Tests ─────────────────────────────────────────
//
// Tests the /health and /readyz responses directly against a Hono
// app instance, without starting a real HTTP server.
//

function createTestApp(consumerPolling: boolean, schedulerRunning: boolean) {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({ status: "alive" });
  });

  app.get("/readyz", (c) => {
    const ready = consumerPolling && schedulerRunning;

    if (!ready) {
      return c.json(
        {
          status: "not_ready",
          consumer: consumerPolling ? "polling" : "stopped",
          scheduler: schedulerRunning ? "running" : "stopped",
        },
        503
      );
    }

    return c.json({
      status: "ready",
      consumer: "polling",
      scheduler: "running",
    });
  });

  return app;
}

describe("/health", () => {
  it("returns 200 with alive status", async () => {
    const app = createTestApp(true, true);
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("alive");
  });

  it("returns 200 even when subsystems are down", async () => {
    const app = createTestApp(false, false);
    const res = await app.request("/health");

    expect(res.status).toBe(200);
  });
});

describe("/readyz", () => {
  it("returns 200 when all subsystems are running", async () => {
    const app = createTestApp(true, true);
    const res = await app.request("/readyz");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.consumer).toBe("polling");
    expect(body.scheduler).toBe("running");
  });

  it("returns 503 when consumer is not polling", async () => {
    const app = createTestApp(false, true);
    const res = await app.request("/readyz");

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("not_ready");
    expect(body.consumer).toBe("stopped");
  });

  it("returns 503 when scheduler is not running", async () => {
    const app = createTestApp(true, false);
    const res = await app.request("/readyz");

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("not_ready");
    expect(body.scheduler).toBe("stopped");
  });

  it("returns 503 when both subsystems are down", async () => {
    const app = createTestApp(false, false);
    const res = await app.request("/readyz");

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.consumer).toBe("stopped");
    expect(body.scheduler).toBe("stopped");
  });
});
