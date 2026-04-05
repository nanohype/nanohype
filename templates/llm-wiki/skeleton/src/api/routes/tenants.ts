import { Hono } from "hono";
import { createTenant, listTenants, getTenant, deleteTenant } from "../../tenant/registry.js";

const TENANT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function validateTenantId(id: string): string | null {
  if (!TENANT_ID_PATTERN.test(id)) {
    return "Tenant ID must be kebab-case (lowercase letters, numbers, hyphens)";
  }
  return null;
}

export const tenantRoutes = new Hono();

tenantRoutes.get("/", (c) => {
  const tenants = listTenants();
  return c.json({ tenants });
});

tenantRoutes.post("/", async (c) => {
  const body = await c.req.json<{
    id: string;
    name: string;
    description?: string;
    schema: string;
  }>();

  if (!body.id || !body.name || !body.schema) {
    return c.json({ error: "Missing required fields: id, name, schema" }, 400);
  }

  const idError = validateTenantId(body.id);
  if (idError) {
    return c.json({ error: idError }, 400);
  }

  try {
    const tenant = createTenant({
      id: body.id,
      name: body.name,
      description: body.description ?? "",
      schema: body.schema,
    });
    return c.json({ tenant }, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      409,
    );
  }
});

tenantRoutes.get("/:id", (c) => {
  const id = c.req.param("id");
  const idError = validateTenantId(id);
  if (idError) return c.json({ error: idError }, 400);

  const tenant = getTenant(id);
  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }
  return c.json({ tenant });
});

tenantRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  const idError = validateTenantId(id);
  if (idError) return c.json({ error: idError }, 400);

  try {
    deleteTenant(id);
    return c.json({ deleted: true });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      404,
    );
  }
});
