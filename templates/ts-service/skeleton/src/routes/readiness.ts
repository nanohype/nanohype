import { Hono } from "hono";

export const readinessRoutes = new Hono();

// ── GET /readyz ─────────────────────────────────────────────────────
//
// Readiness probe — returns 200 only once the service has started AND the
// registered dependency probe passes; 503 otherwise. Kubernetes uses this to
// decide whether to route traffic to the pod. Distinct from /health (liveness),
// which only proves the process is up.
//
// `markReady()` flips the started flag after bootstrap wiring completes.
// `setReadinessProbe()` wires a real dependency check (DB ping, cache reachable,
// upstream healthy). The default probe is always-ready, suitable for a stateless
// service; a probe that returns false or throws yields 503.

export type ReadinessProbe = () => boolean | Promise<boolean>;

let started = false;
let probe: ReadinessProbe = () => true;

export function markReady(): void {
  started = true;
}

export function setReadinessProbe(fn: ReadinessProbe): void {
  probe = fn;
}

readinessRoutes.get("/readyz", async (c) => {
  if (!started) {
    return c.json({ status: "not_ready" }, 503);
  }
  try {
    if (!(await probe())) {
      return c.json({ status: "not_ready" }, 503);
    }
  } catch {
    return c.json({ status: "not_ready" }, 503);
  }
  return c.json({ status: "ready" });
});
