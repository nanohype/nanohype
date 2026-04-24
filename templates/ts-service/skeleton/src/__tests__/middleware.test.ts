import { describe, it, expect } from "vitest";
import { json } from "./helpers.js";
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

    const body = await json(res);
    expect(body.error.message).toBe("Internal Server Error");
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

    const body = await json(res);
    expect(body.error.message).toBe("Not Found");
  });

  it("returns 400 for client errors with the original message", async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get("/bad", () => {
      const err = new Error("Invalid input") as Error & { status: number };
      err.status = 400;
      throw err;
    });

    const res = await app.request("/bad");
    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body.error.message).toBe("Invalid input");
  });

  it("hides internal error messages for 500+ status codes", async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get("/crash", () => {
      const err = new Error("secret database credentials leaked") as Error & {
        status: number;
      };
      err.status = 502;
      throw err;
    });

    const res = await app.request("/crash");
    expect(res.status).toBe(502);

    const body = await json(res);
    expect(body.error.message).toBe("Internal Server Error");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("returns valid JSON content type", async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get("/fail", () => {
      throw new Error("boom");
    });

    const res = await app.request("/fail");
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});
