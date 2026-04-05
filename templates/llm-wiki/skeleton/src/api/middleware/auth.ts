import type { Context, Next } from "hono";

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const apiKey = process.env["WIKI_API_KEY"];

  if (!apiKey) {
    // No API key configured — all requests pass through (development mode)
    console.warn("[auth] WIKI_API_KEY not set — API is unauthenticated");
    return next();
  }

  const authorization = c.req.header("Authorization");
  if (!authorization) {
    return c.json({ error: "Missing Authorization header" }, 401);
  }

  const match = authorization.match(/^Bearer\s+(.+)$/);
  if (!match) {
    return c.json({ error: "Invalid Authorization format. Expected: Bearer <key>" }, 401);
  }

  if (match[1] !== apiKey) {
    return c.json({ error: "Invalid API key" }, 403);
  }

  return next();
}
