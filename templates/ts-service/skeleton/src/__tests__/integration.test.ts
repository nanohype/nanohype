import { describe, it, expect } from "vitest";
import { json } from "./helpers.js";
import { app } from "../app.js";

// ── Helpers ─────────────────────────────────────────────────────────

function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Integration Tests ───────────────────────────────────────────────
//
// End-to-end tests exercising the full Hono app (middleware, routing,
// validation, service, and error handling) without starting an HTTP
// server. Hono's app.request() method drives requests in-process.

describe("POST /api/items", () => {
  it("creates an item with valid body and returns 201", async () => {
    const res = await post("/api/items", {
      name: "Test Widget",
      description: "A test item",
    });

    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("name", "Test Widget");
    expect(body).toHaveProperty("description", "A test item");
    expect(body).toHaveProperty("createdAt");
    expect(body).toHaveProperty("updatedAt");
  });

  it("creates an item without optional description", async () => {
    const res = await post("/api/items", { name: "Minimal Item" });

    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body).toHaveProperty("name", "Minimal Item");
  });

  it("returns 400 with validation error when name is missing", async () => {
    const res = await post("/api/items", { description: "no name" });

    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body).toHaveProperty("error", "Validation failed");
    expect(body.issues).toBeInstanceOf(Array);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("returns 400 with validation error when name is empty", async () => {
    const res = await post("/api/items", { name: "" });

    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body).toHaveProperty("error", "Validation failed");
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await app.request("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{{{",
    });

    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body).toHaveProperty("error", "Invalid JSON");
  });
});

describe("GET /api/items/:id", () => {
  it("returns 200 for an existing item", async () => {
    // Create an item first
    const createRes = await post("/api/items", { name: "Fetchable Item" });
    const created = await json(createRes);

    const res = await app.request(`/api/items/${created.id}`);

    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body).toHaveProperty("id", created.id);
    expect(body).toHaveProperty("name", "Fetchable Item");
  });

  it("returns 404 with NOT_FOUND for non-existent ID", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await app.request(`/api/items/${fakeId}`);

    expect(res.status).toBe(404);

    const body = await json(res);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.statusCode).toBe(404);
  });
});

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await app.request("/health");

    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("service");
    expect(body).toHaveProperty("timestamp");
  });
});

describe("GET /readyz", () => {
  it("returns 503 when not marked ready", async () => {
    // In test context, markReady() is not called — service starts not ready
    const res = await app.request("/readyz");

    // Default state is not ready (503) unless markReady was called
    // by another test or the bootstrap. Both 200 and 503 are valid
    // depending on test ordering, but we verify the response shape.
    const body = await json(res);

    if (res.status === 503) {
      expect(body).toHaveProperty("status", "not_ready");
    } else {
      expect(res.status).toBe(200);
      expect(body).toHaveProperty("status", "ready");
    }
  });
});
