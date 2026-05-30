// ── Provider-shared helpers ──────────────────────────────────────────

import { z } from "zod";

/**
 * Convert an `expires_in` (seconds-from-now, the shape OAuth servers
 * return) into an absolute unix-seconds `expiresAt`. Returns undefined
 * when the provider omits expiry (e.g., Notion's long-lived grants).
 */
export function expiresAtFromExpiresIn(expiresIn?: number): number | undefined {
  if (!expiresIn) return undefined;
  return Math.floor(Date.now() / 1000) + expiresIn;
}

/**
 * Runtime shape of an RFC 6749 token-endpoint response, as returned by
 * most providers. The token endpoint is an external boundary, so the raw
 * response is validated before any field is read. `.passthrough()` keeps
 * provider-specific extras (e.g., `id_token`) available on `raw`.
 *
 * `access_token` is required on the authorization-code exchange; it is
 * optional here so refresh responses that omit it (and some nested-token
 * providers) parse, with the missing-token case rejected downstream.
 */
export const TokenResponseSchema = z
  .object({
    access_token: z.string().optional(),
    refresh_token: z.string().optional(),
    expires_in: z.number().optional(),
    token_type: z.string().optional(),
    scope: z.string().optional(),
  })
  .passthrough();

export type TokenResponse = z.infer<typeof TokenResponseSchema>;
