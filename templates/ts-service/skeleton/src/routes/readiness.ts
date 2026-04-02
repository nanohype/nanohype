import { Hono } from "hono";

export const readinessRoutes = new Hono();

// ── GET /readyz ─────────────────────────────────────────────────────
//
// Readiness probe — returns 200 when the service is ready to accept
// traffic, 503 otherwise. Kubernetes uses this to decide whether to
// route requests to this pod during rolling updates.
//

let ready = false;

export function markReady(): void {
  ready = true;
}

readinessRoutes.get("/readyz", (c) => {
  if (!ready) {
    return c.json({ status: "not_ready" }, 503);
  }
  return c.json({ status: "ready" });
});
