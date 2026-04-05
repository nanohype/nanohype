import { Hono } from "hono";
import { ingest } from "../../operations/ingest.js";

export const sourceRoutes = new Hono();

sourceRoutes.post("/:id/ingest", async (c) => {
  const tenantId = c.req.param("id");
  const body = await c.req.json<{ ref: string }>();

  if (!body.ref) {
    return c.json({ error: "Missing required field: ref" }, 400);
  }

  try {
    const result = await ingest(tenantId, body.ref);
    return c.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 500;
    return c.json({ error: message }, status);
  }
});
