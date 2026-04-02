import { Hono } from "hono";
import { getOpenApiSpec } from "../openapi.js";

// ── OpenAPI Route ───────────────────────────────────────────────────
//
// Serves the OpenAPI 3.1 spec as JSON. Useful for API documentation
// tools (Swagger UI, Redoc, etc.) and client code generation.
//

export const openapiRoutes = new Hono();

openapiRoutes.get("/openapi.json", (c) => {
  return c.json(getOpenApiSpec());
});
