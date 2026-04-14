import type { Context } from "hono";
import { AppError, ValidationError } from "../domain/errors.js";

// ── Error Handler ───────────────────────────────────────────────────
//
// Global error handler mounted via app.onError(). Catches AppError
// subclasses and returns structured JSON with the appropriate status
// code. Unknown errors produce a generic 500 response that hides
// internal details.
//
// Response shape:
//   {
//     "error": {
//       "code": "NOT_FOUND",
//       "message": "Item not found",
//       "statusCode": 404
//     }
//   }
//

export function errorHandler(err: Error, c: Context): Response {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[error] ${c.req.method} ${c.req.path}:`, err);
  }

  // Typed AppError: structured response, include validation issues when present.
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
      },
    };
    if (err instanceof ValidationError && err.issues.length > 0) {
      (body.error as Record<string, unknown>).issues = err.issues;
    }
    return c.json(body, err.statusCode as any);
  }

  // Plain Error with a `status` property (ad-hoc throws, library errors).
  // Propagate the status when present; hide the message on server errors so
  // internal detail doesn't leak.
  const rawStatus = (err as Error & { status?: unknown }).status;
  const status =
    typeof rawStatus === "number" && rawStatus >= 400 && rawStatus < 600
      ? rawStatus
      : 500;

  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: status >= 500 ? "Internal Server Error" : err.message,
        statusCode: status,
      },
    },
    status as any,
  );
}
