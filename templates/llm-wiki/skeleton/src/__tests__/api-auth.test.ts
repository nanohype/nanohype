import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { authMiddleware } from "../api/middleware/auth.js";

/**
 * The API's access decision. Every rejection path is a branch, and a branch
 * nothing exercises is a request nobody proved is refused — which is why the
 * file carries a per-file threshold above the module floor.
 *
 * Driven through a real Hono app rather than a fabricated context, so the
 * middleware is exercised the way the server mounts it.
 */
function appWithAuth() {
  const app = new Hono();
  app.use("*", authMiddleware);
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

afterEach(() => {
  delete process.env["WIKI_API_KEY"];
});

describe("authMiddleware", () => {
  it("passes every request through when no key is configured", async () => {
    const res = await appWithAuth().request("/");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("refuses a request carrying no Authorization header", async () => {
    process.env["WIKI_API_KEY"] = "secret";

    const res = await appWithAuth().request("/");

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Missing Authorization header" });
  });

  it("refuses an Authorization header that is not a Bearer token", async () => {
    process.env["WIKI_API_KEY"] = "secret";

    const res = await appWithAuth().request("/", {
      headers: { Authorization: "Basic c2VjcmV0" },
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("Bearer") });
  });

  it("refuses a Bearer token that is not the configured key", async () => {
    process.env["WIKI_API_KEY"] = "secret";

    const res = await appWithAuth().request("/", {
      headers: { Authorization: "Bearer wrong" },
    });

    // Distinct from 401: the caller presented a credential and it was rejected.
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Invalid API key" });
  });

  it("admits a Bearer token matching the configured key", async () => {
    process.env["WIKI_API_KEY"] = "secret";

    const res = await appWithAuth().request("/", {
      headers: { Authorization: "Bearer secret" },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
