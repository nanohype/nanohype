import { Hono } from "hono";
import { lint } from "../../operations/lint.js";

export const adminRoutes = new Hono();

adminRoutes.post("/:id/lint", async (c) => {
  const tenantId = c.req.param("id");

  try {
    const result = await lint(tenantId);
    return c.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 500;
    return c.json({ error: message }, status);
  }
});
