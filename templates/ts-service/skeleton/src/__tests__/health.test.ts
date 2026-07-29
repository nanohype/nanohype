import { describe, expect, it } from "vitest";
import { app } from "../app.js";
import { json } from "./helpers.js";

describe("GET /health", () => {
  it("returns 200 with status, service, and timestamp", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("service", "__PROJECT_NAME__");
    expect(body).toHaveProperty("timestamp");
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("returns exactly three fields", async () => {
    const res = await app.request("/health");
    const body = await json(res);
    expect(Object.keys(body)).toHaveLength(3);
    expect(Object.keys(body).sort()).toEqual(["service", "status", "timestamp"]);
  });

  it("returns application/json content type", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});
