import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { loggerMiddleware } from "./middleware/logger.js";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRoutes } from "./routes/health.js";
import { readinessRoutes } from "./routes/readiness.js";
import { exampleRoutes } from "./routes/example.js";

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
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    maxAge: 86400,
  })
);
app.use("*", bodyLimit({ maxSize: 1024 * 1024 })); // 1MB
app.use("*", loggerMiddleware);
app.onError(errorHandler);

// ── Routes ───────────────────────────────────────────────────────────
app.route("/", healthRoutes);
app.route("/", readinessRoutes);
app.route("/api", exampleRoutes);
