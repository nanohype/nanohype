import { validateBootstrap } from "./bootstrap.js";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { loadConfig } from "./config.js";
import { initTelemetry } from "./telemetry/index.js";
import { markReady } from "./routes/readiness.js";

// ── Bootstrap ────────────────────────────────────────────────────────
//
// 1. Validate that all scaffolding placeholders have been replaced.
// 2. Validate configuration (exits on invalid env vars).
// 3. Initialize OpenTelemetry (must happen before any other imports
//    that should be instrumented).
// 4. Create the Hono app with routes and middleware.
// 5. Start the HTTP server.
// 6. Mark readiness probe as healthy once listening.
//

validateBootstrap();

const config = loadConfig();

initTelemetry();

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`__PROJECT_NAME__ listening on http://localhost:${info.port}`);
  markReady();
});

// ── Graceful Shutdown ───────────────────────────────────────────────
//
// On SIGTERM / SIGINT, stop accepting new connections and let
// in-flight requests drain. Force-exit after 10 seconds if the
// server hasn't closed cleanly — prevents zombie pods in k8s.
//

const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => {
    console.error("Forced shutdown");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
