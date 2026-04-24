import { describe, it, expect } from "vitest";
import { json } from "./helpers.js";
import { Hono } from "hono";
import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  TimeoutError,
} from "../domain/errors.js";
import { errorHandler } from "../middleware/error-handler.js";

// ── Helpers ─────────────────────────────────────────────────────────

function buildApp() {
  const app = new Hono();
  app.onError(errorHandler);
  return app;
}

// ── Domain Error Classes ────────────────────────────────────────────

describe("domain error classes", () => {
  it("AppError carries statusCode and code", () => {
    const err = new AppError("something failed", 418, "TEAPOT");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe("something failed");
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe("TEAPOT");
    expect(err.name).toBe("AppError");
  });

  it("ValidationError returns 400 with VALIDATION_ERROR code", () => {
    const err = new ValidationError("bad input");

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.issues).toEqual([]);
  });

  it("NotFoundError returns 404 with NOT_FOUND code", () => {
    const err = new NotFoundError();

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Resource not found");
  });

  it("ConflictError returns 409 with CONFLICT code", () => {
    const err = new ConflictError();

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("Resource already exists");
  });

  it("TimeoutError returns 408 with TIMEOUT code", () => {
    const err = new TimeoutError();

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(408);
    expect(err.code).toBe("TIMEOUT");
    expect(err.message).toBe("Operation timed out");
  });
});

// ── Error Handler Middleware ────────────────────────────────────────

describe("errorHandler with domain errors", () => {
  it("returns structured JSON for ValidationError", async () => {
    const app = buildApp();
    app.get("/fail", () => {
      throw new ValidationError("Name is required");
    });

    const res = await app.request("/fail");
    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Name is required");
    expect(body.error.statusCode).toBe(400);
  });

  it("returns structured JSON for NotFoundError", async () => {
    const app = buildApp();
    app.get("/fail", () => {
      throw new NotFoundError("Item not found");
    });

    const res = await app.request("/fail");
    expect(res.status).toBe(404);

    const body = await json(res);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Item not found");
    expect(body.error.statusCode).toBe(404);
  });

  it("returns structured JSON for ConflictError", async () => {
    const app = buildApp();
    app.get("/fail", () => {
      throw new ConflictError("Duplicate entry");
    });

    const res = await app.request("/fail");
    expect(res.status).toBe(409);

    const body = await json(res);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toBe("Duplicate entry");
    expect(body.error.statusCode).toBe(409);
  });

  it("returns structured JSON for TimeoutError", async () => {
    const app = buildApp();
    app.get("/fail", () => {
      throw new TimeoutError("Upstream timed out");
    });

    const res = await app.request("/fail");
    expect(res.status).toBe(408);

    const body = await json(res);
    expect(body.error.code).toBe("TIMEOUT");
    expect(body.error.message).toBe("Upstream timed out");
    expect(body.error.statusCode).toBe(408);
  });

  it("returns 500 with generic message for unknown Error (no stack leak)", async () => {
    const app = buildApp();
    app.get("/fail", () => {
      throw new Error("secret database password is hunter2");
    });

    const res = await app.request("/fail");
    expect(res.status).toBe(500);

    const body = await json(res);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Internal Server Error");
    expect(body.error.statusCode).toBe(500);
    // Ensure no internal details leak
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("includes Zod issues in ValidationError response", async () => {
    const app = buildApp();
    app.get("/fail", () => {
      throw new ValidationError("Validation failed", [
        { path: "name", message: "Name is required" },
        { path: "email", message: "Invalid email format" },
      ]);
    });

    const res = await app.request("/fail");
    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.issues).toHaveLength(2);
    expect(body.error.issues[0]).toEqual({
      path: "name",
      message: "Name is required",
    });
    expect(body.error.issues[1]).toEqual({
      path: "email",
      message: "Invalid email format",
    });
  });

  it("omits issues field when ValidationError has no issues", async () => {
    const app = buildApp();
    app.get("/fail", () => {
      throw new ValidationError("Something invalid");
    });

    const res = await app.request("/fail");
    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error).not.toHaveProperty("issues");
  });
});
