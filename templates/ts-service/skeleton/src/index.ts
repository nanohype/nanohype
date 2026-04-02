import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { initTelemetry } from "./telemetry/index.js";

// ── Bootstrap ────────────────────────────────────────────────────────
//
// 1. Initialize OpenTelemetry (must happen before any other imports
//    that should be instrumented).
// 2. Create the Hono app with routes and middleware.
// 3. Start the HTTP server.
//

initTelemetry();

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`__PROJECT_NAME__ listening on http://localhost:${info.port}`);
});
