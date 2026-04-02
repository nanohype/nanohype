import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { errorHandler } from "../middleware/error-handler.js";

describe("errorHandler", () => {
  it("returns JSON error response with 500 status for unhandled errors", async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get("/fail", () => {
      throw new Error("something broke");
    });

    const res = await app.request("/fail");
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body).toHaveProperty("error", "Internal Server Error");
  });

  it("preserves error status when present", async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get("/not-found", () => {
      const err = new Error("Not Found") as Error & { status: number };
      err.status = 404;
      throw err;
    });

    const res = await app.request("/not-found");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body).toHaveProperty("error", "Not Found");
  });
});
