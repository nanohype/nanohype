// ── Shared error → Response mapper ───────────────────────────────────
//
// The start / refresh / revoke handlers all fall through to the same
// catch-all: Unauthenticated → 401, UnknownProvider → 404, OAuthError →
// 400 with code, anything else → 500. Callback does more (clears the
// state cookie, distinguishes state/provider errors) so it keeps its
// own custom mapping.

import {
  OAuthError,
  UnauthenticatedError,
  UnknownProviderError,
  errorMessage,
} from "../errors.js";
import { logger } from "../logger.js";

export function mapHandlerError(err: unknown, context: string): Response {
  if (err instanceof UnauthenticatedError) {
    return new Response("unauthenticated", { status: 401 });
  }
  if (err instanceof UnknownProviderError) {
    return new Response(err.message, { status: 404 });
  }
  if (err instanceof OAuthError) {
    logger.warn(`${context} handler error`, { code: err.code, provider: err.provider });
    return new Response(err.code, { status: 400 });
  }
  logger.error(`${context} handler unexpected error`, { error: errorMessage(err) });
  return new Response("internal_error", { status: 500 });
}
