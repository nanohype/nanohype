import { createServer as createHttpServer } from "node:http";
import { Hono } from "hono";
import { tenantRoutes } from "./routes/tenants.js";
import { sourceRoutes } from "./routes/sources.js";
import { wikiRoutes } from "./routes/wiki.js";
import { adminRoutes } from "./routes/admin.js";
import { authMiddleware } from "./middleware/auth.js";

export function createServer(): Hono {
  const app = new Hono();

  app.use("*", authMiddleware);

  app.route("/tenants", tenantRoutes);
  app.route("/tenants", sourceRoutes);
  app.route("/tenants", wikiRoutes);
  app.route("/tenants", adminRoutes);

  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return app;
}

export function startServer(port: number): void {
  const app = createServer();

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    const body = req.method !== "GET" && req.method !== "HEAD"
      ? await new Promise<Buffer>((resolve) => {
          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => resolve(Buffer.concat(chunks)));
        })
      : undefined;

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body,
    });

    const response = await app.fetch(request);

    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    const responseBody = await response.arrayBuffer();
    res.end(Buffer.from(responseBody));
  });

  server.listen(port, () => {
    console.log(`Wiki API server listening on port ${port}`);
  });
}
