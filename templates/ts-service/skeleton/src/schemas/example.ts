import { z } from "zod";

// ── Example Schemas ─────────────────────────────────────────────────
//
// Zod schemas for request validation. Shared between route handlers
// (via validate middleware) and services (for programmatic validation).
//

export const CreateItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
});

export const UpdateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
});

export const ItemIdSchema = z.object({
  id: z.string().uuid(),
});

export const QueryItemSchema = z.object({
  limit: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .optional(),
  offset: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(0))
    .optional(),
});

export type CreateItemInput = z.infer<typeof CreateItemSchema>;
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>;
export type QueryItemInput = z.infer<typeof QueryItemSchema>;
