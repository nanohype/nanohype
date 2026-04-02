import type { Context, Next } from "hono";
import type { ZodSchema } from "zod";

// ── Request Validation Middleware ────────────────────────────────────
//
// Zod-based request body validation for Hono routes. Parses the JSON
// body against the provided schema and returns a 400 with structured
// error details on failure. On success, the validated (and typed) data
// is set on the context as "validatedBody" for the route handler.
//
// Usage:
//   import { z } from "zod";
//   import { validate } from "../middleware/validate.js";
//
//   const createItemSchema = z.object({ name: z.string().min(1) });
//
//   app.post("/items", validate(createItemSchema), async (c) => {
//     const body = c.get("validatedBody");
//     // body is typed and validated
//   });
//

export function validate(schema: ZodSchema) {
  return async (c: Context, next: Next): Promise<void | Response> => {
    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: "Invalid JSON", issues: [{ message: "Request body must be valid JSON" }] },
        400
      );
    }

    const result = schema.safeParse(body);

    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

      return c.json({ error: "Validation failed", issues }, 400);
    }

    c.set("validatedBody", result.data);
    await next();
  };
}
