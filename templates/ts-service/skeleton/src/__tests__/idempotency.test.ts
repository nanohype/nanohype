import { describe, it, expect } from "vitest";
import { json } from "./helpers.js";
import { Hono } from "hono";
import { idempotency } from "../middleware/idempotency.js";

// ── Helpers ─────────────────────────────────────────────────────────

function buildApp(options?: { ttlMs?: number }) {
  const app = new Hono();
  app.use("*", idempotency(options));

  app.post("/items", async (c) => {
    const body = await c.req.json();
    return c.json({ id: "abc-123", name: body.name }, 201);
  });

  app.put("/items/:id", async (c) => {
    const body = await c.req.json();
    return c.json({ id: c.req.param("id"), name: body.name }, 200);
  });

  app.get("/items", (c) => {
    return c.json({ items: [] });
  });

  return app;
}

function post(app: Hono, body: unknown, headers?: Record<string, string>) {
  return app.request("/items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function put(app: Hono, id: string, body: unknown, headers?: Record<string, string>) {
  return app.request(`/items/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("idempotency middleware", () => {
  it("first POST with key returns 201", async () => {
    const app = buildApp();
    const res = await post(
      app,
      { name: "Widget" },
      {
        "Idempotency-Key": "key-001",
      }
    );

    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body).toHaveProperty("id", "abc-123");
    expect(body).toHaveProperty("name", "Widget");
  });

  it("second POST with same key returns cached 201 with same body", async () => {
    const app = buildApp();
    const payload = { name: "Widget" };

    // First request
    const res1 = await post(app, payload, {
      "Idempotency-Key": "key-002",
    });
    expect(res1.status).toBe(201);
    const body1 = await json(res1);

    // Second request — same key, same body
    const res2 = await post(app, payload, {
      "Idempotency-Key": "key-002",
    });
    expect(res2.status).toBe(201);

    const body2 = await json(res2);
    expect(body2).toEqual(body1);

    // Verify replayed header
    expect(res2.headers.get("X-Idempotent-Replayed")).toBe("true");
  });

  it("POST with same key but different body returns 409", async () => {
    const app = buildApp();

    // First request
    const res1 = await post(
      app,
      { name: "Widget" },
      {
        "Idempotency-Key": "key-003",
      }
    );
    expect(res1.status).toBe(201);

    // Second request — same key, different body
    const res2 = await post(
      app,
      { name: "Gadget" },
      {
        "Idempotency-Key": "key-003",
      }
    );
    expect(res2.status).toBe(409);

    const body = await json(res2);
    expect(body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("GET requests ignore the Idempotency-Key header", async () => {
    const app = buildApp();

    const res = await app.request("/items", {
      method: "GET",
      headers: { "Idempotency-Key": "key-004" },
    });

    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body).toHaveProperty("items");

    // No replayed header on GET
    expect(res.headers.get("X-Idempotent-Replayed")).toBeNull();
  });

  it("keys expire after TTL", async () => {
    // Use a tiny TTL so entries expire immediately
    const app = buildApp({ ttlMs: 1 });
    const payload = { name: "Ephemeral" };

    // First request
    const res1 = await post(app, payload, {
      "Idempotency-Key": "key-005",
    });
    expect(res1.status).toBe(201);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second request — key expired, treated as new request
    const res2 = await post(app, payload, {
      "Idempotency-Key": "key-005",
    });
    expect(res2.status).toBe(201);

    // Should NOT be a replay
    expect(res2.headers.get("X-Idempotent-Replayed")).toBeNull();
  });

  it("PUT requests are also covered by idempotency", async () => {
    const app = buildApp();
    const payload = { name: "Updated" };

    const res1 = await put(app, "xyz", payload, {
      "Idempotency-Key": "key-006",
    });
    expect(res1.status).toBe(200);

    const res2 = await put(app, "xyz", payload, {
      "Idempotency-Key": "key-006",
    });
    expect(res2.status).toBe(200);
    expect(res2.headers.get("X-Idempotent-Replayed")).toBe("true");
  });

  it("requests without Idempotency-Key proceed normally", async () => {
    const app = buildApp();

    const res = await post(app, { name: "NoKey" });
    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body).toHaveProperty("name", "NoKey");
  });
});
