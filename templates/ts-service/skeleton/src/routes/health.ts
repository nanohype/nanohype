import { Hono } from "hono";

export const healthRoutes = new Hono();

// ── GET /health ──────────────────────────────────────────────────────
//
// Returns service health status. Useful for load balancer probes
// and container orchestrator liveness checks.
//

healthRoutes.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "__PROJECT_NAME__",
    timestamp: new Date().toISOString(),
  });
});
