import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../middleware/validate.js";

// ── Schema ──────────────────────────────────────────────────────────

const itemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  count: z.number().int().positive().optional(),
});

// ── Helpers ─────────────────────────────────────────────────────────

function buildApp() {
  const app = new Hono();
  app.post("/items", validate(itemSchema), (c) => {
    const body = c.get("validatedBody");
    return c.json({ received: body }, 201);
  });
  return app;
}

function post(app: ReturnType<typeof buildApp>, body: unknown) {
  return app.request("/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("validate middleware", () => {
  it("passes valid data through to the handler", async () => {
    const app = buildApp();
    const res = await post(app, { name: "widget", count: 5 });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.received).toEqual({ name: "widget", count: 5 });
  });

  it("passes when optional fields are omitted", async () => {
    const app = buildApp();
    const res = await post(app, { name: "widget" });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.received).toEqual({ name: "widget" });
  });

  it("rejects when a required field is missing", async () => {
    const app = buildApp();
    const res = await post(app, { count: 3 });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error", "Validation failed");
    expect(body.issues).toBeInstanceOf(Array);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("rejects when a field has the wrong type", async () => {
    const app = buildApp();
    const res = await post(app, { name: "widget", count: "not-a-number" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error", "Validation failed");
    expect(body.issues.some((i: { path: string }) => i.path === "count")).toBe(true);
  });

  it("rejects when name is an empty string", async () => {
    const app = buildApp();
    const res = await post(app, { name: "" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error", "Validation failed");
    expect(body.issues.some((i: { message: string }) => i.message === "Name is required")).toBe(
      true
    );
  });

  it("rejects invalid JSON body", async () => {
    const app = buildApp();
    const res = await app.request("/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{{{",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error", "Invalid JSON");
  });

  it("includes path information in validation issues", async () => {
    const app = buildApp();
    const res = await post(app, { name: 123 });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues.some((i: { path: string }) => i.path === "name")).toBe(true);
  });

  it("strips unknown fields via zod strict mode", async () => {
    const strictSchema = z.object({ name: z.string() }).strict();
    const strictApp = new Hono();
    strictApp.post("/strict", validate(strictSchema), (c) => {
      return c.json({ received: c.get("validatedBody") });
    });

    const res = await strictApp.request("/strict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ok", extra: "nope" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error", "Validation failed");
  });
});
