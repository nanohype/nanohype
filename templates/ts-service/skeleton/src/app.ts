import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { loggerMiddleware } from "./middleware/logger.js";
import { metricsMiddleware } from "./middleware/metrics.js";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { idempotency } from "./middleware/idempotency.js";
import { healthRoutes } from "./routes/health.js";
import { readinessRoutes } from "./routes/readiness.js";
import { exampleRoutes } from "./routes/example.js";
import { openapiRoutes } from "./routes/openapi.js";

// ── App ──────────────────────────────────────────────────────────────
//
// Hono app with middleware and routes. Add new route modules here.
//

export const app = new Hono();

// ── Middleware ────────────────────────────────────────────────────────
app.use("*", requestId);
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID", "Idempotency-Key"],
    maxAge: 86400,
  })
);
app.use("*", bodyLimit({ maxSize: 1024 * 1024 })); // 1MB
app.use("*", loggerMiddleware);
app.use("*", metricsMiddleware);
app.use("/api/*", idempotency());
app.onError(errorHandler);

// ── Routes ───────────────────────────────────────────────────────────
app.route("/", healthRoutes);
app.route("/", readinessRoutes);
app.route("/api", exampleRoutes);
app.route("/", openapiRoutes);
