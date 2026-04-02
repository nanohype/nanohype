import { Hono } from "hono";
import { validate } from "../middleware/validate.js";
import { CreateItemSchema, UpdateItemSchema } from "../schemas/example.js";
import {
  ExampleService,
  InMemoryItemRepository,
} from "../services/example.js";

// ── Example CRUD Routes ──────────────────────────────────────────────
//
// Thin HTTP layer that delegates to ExampleService. Business logic
// lives in the service; routes handle parsing, validation, and HTTP
// response formatting. Domain errors (NotFoundError, etc.) propagate
// to the global error handler middleware.
//

const service = new ExampleService(new InMemoryItemRepository());

export const exampleRoutes = new Hono();

// ── List ─────────────────────────────────────────────────────────────

exampleRoutes.get("/items", async (c) => {
  const items = await service.listItems();
  return c.json({ items });
});

// ── Get by ID ────────────────────────────────────────────────────────

exampleRoutes.get("/items/:id", async (c) => {
  const item = await service.getItem(c.req.param("id"));
  return c.json(item);
});

// ── Create ───────────────────────────────────────────────────────────

exampleRoutes.post("/items", validate(CreateItemSchema), async (c) => {
  const body = c.get("validatedBody");
  const item = await service.createItem(body);
  return c.json(item, 201);
});

// ── Update ───────────────────────────────────────────────────────────

exampleRoutes.patch("/items/:id", validate(UpdateItemSchema), async (c) => {
  const body = c.get("validatedBody");
  const item = await service.updateItem(c.req.param("id"), body);
  return c.json(item);
});

// ── Delete ───────────────────────────────────────────────────────────

exampleRoutes.delete("/items/:id", async (c) => {
  await service.deleteItem(c.req.param("id"));
  return c.json({ deleted: true });
});
