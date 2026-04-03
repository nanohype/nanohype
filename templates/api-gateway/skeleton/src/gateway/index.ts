import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { validateBootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { matchRoute } from "./router/matcher.js";
import { proxyRequest } from "./router/proxy.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createRateLimitMiddleware } from "./middleware/rate-limit.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import { createTransformMiddleware } from "./middleware/transform.js";
import { selectUpstream, isCanaryConfig } from "./traffic/canary.js";
import { createHealthChecker } from "./traffic/health.js";
import { createCircuitBreaker, type CircuitBreaker } from "./resilience/circuit-breaker.js";
import { gatewayProxyTotal, gatewayProxyDuration } from "./metrics.js";
import type { GatewayConfig, RouteRule } from "./types.js";

// ── Gateway Entry Point ─────────────────────────────────────────────
//
// createGateway() reads route rules from config, creates a Hono app,
// and wires middleware per route. Each route gets its own auth, rate
// limit, CORS, and transform middleware based on its rule definition.
// Circuit breakers are created per upstream, and a health checker
// monitors all upstreams periodically.
//
// Framework: __FRAMEWORK__
//

/** Extract all unique upstream URLs from route rules. */
function collectUpstreams(routes: RouteRule[]): string[] {
  const urls = new Set<string>();

  for (const rule of routes) {
    if (typeof rule.upstream === "string") {
      urls.add(rule.upstream);
    } else {
      urls.add(rule.upstream.primary);
      urls.add(rule.upstream.canary);
    }
  }

  return Array.from(urls);
}

/**
 * Create and configure the gateway Hono app. Wires per-route
 * middleware, circuit breakers, health checking, and the proxy handler.
 * Returns the Hono app and a shutdown function for cleanup.
 */
export function createGateway(config: GatewayConfig) {
  const logger = createLogger("gateway", (config.logLevel as "debug" | "info" | "warn" | "error") ?? "info");
  const app = new Hono();

  // ── Per-upstream circuit breakers (instance-scoped) ──────────────
  const breakers = new Map<string, CircuitBreaker>();

  function getBreaker(url: string): CircuitBreaker {
    let breaker = breakers.get(url);
    if (!breaker) {
      breaker = createCircuitBreaker(url, logger);
      breakers.set(url, breaker);
    }
    return breaker;
  }

  // ── Health checker ────────────────────────────────────────────────
  const healthChecker = createHealthChecker(logger);

  if (config.healthCheckEnabled !== false) {
    const upstreams = collectUpstreams(config.routes);
    for (const url of upstreams) {
      healthChecker.register({ url });
    }
  }

  // ── Health endpoint ───────────────────────────────────────────────
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      service: "__PROJECT_NAME__",
      timestamp: new Date().toISOString(),
      upstreams: healthChecker.status(),
    });
  });

  // ── Per-route middleware and proxy ────────────────────────────────
  //
  // Each route rule is registered as a Hono route with its own
  // middleware chain: CORS -> auth -> rate limit -> transform -> proxy.
  //
  for (const rule of config.routes) {
    const path = rule.path.endsWith("/*") ? rule.path : rule.path;
    const middlewares: Array<(c: unknown, next: () => Promise<void>) => Promise<unknown>> = [];

    // CORS middleware
    if (rule.cors) {
      middlewares.push(createCorsMiddleware(rule.cors) as (c: unknown, next: () => Promise<void>) => Promise<unknown>);
    }

    // Auth middleware
    if (rule.auth && rule.auth !== "none") {
      middlewares.push(createAuthMiddleware(rule.auth, config, logger) as (c: unknown, next: () => Promise<void>) => Promise<unknown>);
    }

    // Rate limit middleware
    if (rule.rateLimit) {
      middlewares.push(createRateLimitMiddleware(rule.rateLimit) as (c: unknown, next: () => Promise<void>) => Promise<unknown>);
    }

    // Transform middleware
    if (rule.transform) {
      middlewares.push(createTransformMiddleware(rule.transform) as (c: unknown, next: () => Promise<void>) => Promise<unknown>);
    }

    // Register middleware for this route path
    for (const mw of middlewares) {
      app.use(path, mw as Parameters<typeof app.use>[1]);
    }
  }

  // ── Catch-all proxy handler ───────────────────────────────────────
  app.all("*", async (c) => {
    const start = performance.now();
    const path = c.req.path;
    const method = c.req.method;

    const match = matchRoute(config.routes, path, method);

    if (!match) {
      return c.json({ error: "Not Found", message: "No route matches this request" }, 404);
    }

    // Resolve upstream URL (handle canary splitting)
    let upstreamUrl = match.upstreamUrl;
    if (isCanaryConfig(match.rule.upstream)) {
      upstreamUrl = selectUpstream(match.rule.upstream);
    }

    // Circuit breaker check
    const breaker = getBreaker(upstreamUrl);
    if (!breaker.allowRequest()) {
      logger.warn("Circuit breaker open, rejecting request", {
        upstream: upstreamUrl,
        path,
      });
      return c.json(
        { error: "Service Unavailable", message: "Upstream circuit breaker is open" },
        503,
      );
    }

    // Health check gate
    if (config.healthCheckEnabled !== false && !healthChecker.isHealthy(upstreamUrl)) {
      logger.warn("Upstream unhealthy, rejecting request", {
        upstream: upstreamUrl,
        path,
      });
      return c.json(
        { error: "Service Unavailable", message: "Upstream is unhealthy" },
        503,
      );
    }

    // Proxy the request
    const timeoutMs = match.rule.timeoutMs ?? config.defaultTimeoutMs ?? 30_000;
    const transform = (c.get("transformRule") as typeof match.rule.transform) ?? match.rule.transform;

    const proxyResponse = await proxyRequest(
      upstreamUrl,
      match.forwardPath,
      c.req.raw,
      logger,
      { timeoutMs, transform },
    );

    // Record circuit breaker outcome
    if (proxyResponse.status >= 500) {
      breaker.recordFailure();
    } else {
      breaker.recordSuccess();
    }

    // Record metrics
    const durationMs = performance.now() - start;
    const labels = {
      method,
      path: match.rule.path,
      upstream: upstreamUrl,
      status: String(proxyResponse.status),
    };
    gatewayProxyTotal.add(1, labels);
    gatewayProxyDuration.record(durationMs, labels);

    // Build the response
    const response = new Response(proxyResponse.body, {
      status: proxyResponse.status,
      headers: proxyResponse.headers,
    });

    return response;
  });

  // ── Shutdown ──────────────────────────────────────────────────────
  function shutdown(): void {
    healthChecker.shutdown();
    breakers.clear();
    logger.info("Gateway shut down");
  }

  return { app, shutdown, healthChecker };
}

// ── Standalone Server ───────────────────────────────────────────────
//
// When run directly (not imported as a library), boot the gateway
// as a standalone HTTP server with graceful shutdown.
//

validateBootstrap();

const config = loadConfig();
const { app, shutdown } = createGateway(config);

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`__PROJECT_NAME__ listening on http://localhost:${info.port}`);
});

const handleShutdown = (signal: string) => {
  console.log(`${signal} received, shutting down...`);
  shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => {
    console.error("Forced shutdown");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
