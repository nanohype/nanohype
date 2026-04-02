import type { Context, Next } from "hono";
import * as jose from "jose";

// ── Auth Middleware ──────────────────────────────────────────────────
//
// JWT validation middleware using the jose library. Extracts the
// Bearer token from the Authorization header, verifies it against
// a symmetric secret, and sets the decoded payload on the context.
//
// The verifier is pluggable: replace the `verifyToken` function to
// use JWKS, asymmetric keys, or an external auth service.
//

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "change-me-in-production"
);
const JWT_ISSUER = process.env.JWT_ISSUER ?? "__PROJECT_NAME__";

// ── Pluggable verifier ───────────────────────────────────────────────
//
// Replace this function to integrate with your auth provider.
//

async function verifyToken(token: string): Promise<jose.JWTPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
  });
  return payload;
}

// ── Middleware ────────────────────────────────────────────────────────

export async function authMiddleware(c: Context, next: Next): Promise<void> {
  const header = c.req.header("Authorization");

  if (!header?.startsWith("Bearer ")) {
    c.status(401);
    c.res = c.json({ error: "Missing or malformed Authorization header" }, 401);
    return;
  }

  const token = header.slice(7);

  try {
    const payload = await verifyToken(token);
    c.set("jwtPayload", payload);
  } catch {
    c.status(401);
    c.res = c.json({ error: "Invalid or expired token" }, 401);
    return;
  }

  await next();
}
