import { describe, it, expect } from "vitest";
import { app } from "../app.js";

describe("GET /health", () => {
  it("returns 200 with status, service, and timestamp", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("service", "__PROJECT_NAME__");
    expect(body).toHaveProperty("timestamp");
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
