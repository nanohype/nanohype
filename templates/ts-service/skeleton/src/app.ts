import { Hono } from "hono";
import { loggerMiddleware } from "./middleware/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRoutes } from "./routes/health.js";
import { exampleRoutes } from "./routes/example.js";

// ── App ──────────────────────────────────────────────────────────────
//
// Hono app with middleware and routes. Add new route modules here.
//

export const app = new Hono();

// ── Middleware ────────────────────────────────────────────────────────
app.use("*", loggerMiddleware);
app.onError(errorHandler);

// ── Routes ───────────────────────────────────────────────────────────
app.route("/", healthRoutes);
app.route("/api", exampleRoutes);
