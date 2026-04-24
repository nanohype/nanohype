// Module augmentation so Hono's `c.get(...)` / `c.set(...)` are typed
// for the context variables this service installs through middleware.
//
// - requestId   set by middleware/request-id.ts
// - validatedBody set by middleware/validate.ts; typed as unknown at
//   the framework boundary, narrowed per route by casting to the
//   schema's inferred output.

import "hono";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
    validatedBody: unknown;
  }
}
