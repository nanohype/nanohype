import { Hono } from "hono";

// ── Example CRUD Routes ──────────────────────────────────────────────
//
// Demonstrates the route pattern. Replace with your own domain logic.
// Mount under /api in app.ts.
//

interface Item {
  id: string;
  name: string;
  createdAt: string;
}

const store = new Map<string, Item>();

export const exampleRoutes = new Hono();

// ── List ─────────────────────────────────────────────────────────────

exampleRoutes.get("/items", (c) => {
  return c.json({ items: Array.from(store.values()) });
});

// ── Get by ID ────────────────────────────────────────────────────────

exampleRoutes.get("/items/:id", (c) => {
  const item = store.get(c.req.param("id"));
  if (!item) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(item);
});

// ── Create ───────────────────────────────────────────────────────────

exampleRoutes.post("/items", async (c) => {
  const body = await c.req.json<{ name?: string }>();
  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }

  const id = crypto.randomUUID();
  const item: Item = {
    id,
    name: body.name,
    createdAt: new Date().toISOString(),
  };
  store.set(id, item);

  return c.json(item, 201);
});

// ── Delete ───────────────────────────────────────────────────────────

exampleRoutes.delete("/items/:id", (c) => {
  const id = c.req.param("id");
  if (!store.has(id)) {
    return c.json({ error: "Not found" }, 404);
  }
  store.delete(id);
  return c.json({ deleted: true });
});
