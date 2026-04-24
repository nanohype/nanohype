// ── Domain Errors ───────────────────────────────────────────────────
//
// Typed error hierarchy for the service domain. Each subclass maps to
// a specific HTTP status code and machine-readable error code. The
// error-handler middleware catches these and returns structured JSON.
//

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  readonly issues: Array<{ path: string; message: string }>;

  constructor(message: string, issues: Array<{ path: string; message: string }> = []) {
    super(message, 400, "VALIDATION_ERROR");
    this.issues = issues;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(message, 409, "CONFLICT");
  }
}

export class TimeoutError extends AppError {
  constructor(message = "Operation timed out") {
    super(message, 408, "TIMEOUT");
  }
}
