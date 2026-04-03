/**
 * __PROJECT_NAME__ — Cloudflare Worker entry point.
 *
 * Handles incoming HTTP requests at the edge. Add route handlers,
 * middleware, and bindings (R2, D1, KV, etc.) as needed.
 */

export interface Env {
  // Uncomment bindings as needed:
  // BUCKET: R2Bucket;
  // DB: D1Database;
  // KV: KVNamespace;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    // API routes
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    // Default response
    return Response.json(
      {
        name: "__PROJECT_NAME__",
        message: "Worker is running",
        timestamp: new Date().toISOString(),
      },
      {
        headers: { "content-type": "application/json" },
      },
    );
  },
} satisfies ExportedHandler<Env>;

async function handleApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.method === "GET" && url.pathname === "/api/status") {
    return Response.json({
      status: "ok",
      region: request.cf?.colo ?? "unknown",
      timestamp: new Date().toISOString(),
    });
  }

  return Response.json(
    { error: "Not found" },
    { status: 404 },
  );
}
