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

  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
      },
    };

    // Include validation issues when present
    if (err instanceof ValidationError && err.issues.length > 0) {
      (body.error as Record<string, unknown>).issues = err.issues;
    }

    return c.json(body, err.statusCode as any);
  }

  // Unknown errors — hide internal details
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal Server Error",
        statusCode: 500,
      },
    },
    500
  );
}
