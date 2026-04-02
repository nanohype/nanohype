import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import * as jose from "jose";
import { authMiddleware } from "../middleware/auth.js";

// ── Helpers ─────────────────────────────────────────────────────────

const JWT_SECRET = new TextEncoder().encode("change-me-in-production");
const JWT_ISSUER = "__PROJECT_NAME__";

function buildApp() {
  const app = new Hono();
  app.use("/protected/*", authMiddleware);
  app.get("/protected/resource", (c) => {
    return c.json({ ok: true, sub: c.get("jwtPayload")?.sub });
  });
  return app;
}

async function signToken(
  payload: jose.JWTPayload,
  opts?: { expiresIn?: string }
) {
  const builder = new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER);
  if (opts?.expiresIn) {
    builder.setExpirationTime(opts.expiresIn);
  } else {
    builder.setExpirationTime("1h");
  }
  return builder.sign(JWT_SECRET);
}

// ── Tests ───────────────────────────────────────────────────────────

describe("authMiddleware", () => {
  it("passes through with a valid token", async () => {
    const app = buildApp();
    const token = await signToken({ sub: "user-1" });

    const res = await app.request("/protected/resource", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, sub: "user-1" });
  });

  it("rejects requests with no Authorization header", async () => {
    const app = buildApp();

    const res = await app.request("/protected/resource");

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/missing|malformed/i);
  });

  it("rejects requests with a non-Bearer scheme", async () => {
    const app = buildApp();

    const res = await app.request("/protected/resource", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/missing|malformed/i);
  });

  it("rejects an expired token", async () => {
    const app = buildApp();
    // Create a token that expired 1 hour ago
    const token = await new jose.SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setIssuer(JWT_ISSUER)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(JWT_SECRET);

    const res = await app.request("/protected/resource", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/invalid|expired/i);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const app = buildApp();
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await new jose.SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(JWT_ISSUER)
      .setExpirationTime("1h")
      .sign(wrongSecret);

    const res = await app.request("/protected/resource", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid|expired/i);
  });

  it("rejects a malformed token string", async () => {
    const app = buildApp();

    const res = await app.request("/protected/resource", {
      headers: { Authorization: "Bearer not.a.valid.jwt" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
