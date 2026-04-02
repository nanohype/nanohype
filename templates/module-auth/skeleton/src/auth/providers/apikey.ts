// ── API Key Provider ─────────────────────────────────────────────────
//
// Validates requests by checking an API key sent in the X-API-Key
// header (or Authorization: Bearer) against a set of valid keys
// configured via environment variables.
//
// Environment variables:
//   AUTH_API_KEYS — Comma-separated list of valid API keys
//
// Each key can optionally include metadata in the format:
//   key:role1+role2:label
// For example:
//   sk-abc123:admin+editor:production-key,sk-xyz789:reader:staging-key

import type { AuthResult } from "../types.js";
import type { AuthProvider, AuthRequest } from "./types.js";
import { registerProvider } from "./registry.js";

interface ParsedKey {
  key: string;
  roles: string[];
  label: string;
}

/**
 * Parse the AUTH_API_KEYS environment variable into structured key entries.
 */
function parseApiKeys(raw: string): ParsedKey[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(":");
      return {
        key: parts[0]!,
        roles: parts[1]?.split("+").filter(Boolean) ?? [],
        label: parts[2] ?? "unnamed",
      };
    });
}

/**
 * Extract the API key from either the X-API-Key header or the
 * Authorization: Bearer header.
 */
function extractApiKey(request: AuthRequest): string | null {
  const getHeader = (name: string): string | null | undefined =>
    typeof request.headers.get === "function"
      ? request.headers.get(name)
      : (request.headers[name] as string | undefined);

  // Prefer X-API-Key header
  const apiKeyHeader = getHeader("x-api-key");
  if (apiKeyHeader && typeof apiKeyHeader === "string") {
    return apiKeyHeader;
  }

  // Fall back to Bearer token
  const authHeader = getHeader("authorization");
  if (authHeader && typeof authHeader === "string") {
    const match = authHeader.match(/^Bearer\s+(\S+)$/i);
    return match?.[1] ?? null;
  }

  return null;
}

const apikeyProvider: AuthProvider = {
  name: "apikey",

  async verifyRequest(request: AuthRequest): Promise<AuthResult> {
    const rawKeys = process.env.AUTH_API_KEYS;
    if (!rawKeys) {
      return {
        authenticated: false,
        error: "API key provider not configured: set AUTH_API_KEYS",
      };
    }

    const providedKey = extractApiKey(request);
    if (!providedKey) {
      return {
        authenticated: false,
        error: "Missing API key (send via X-API-Key header or Bearer token)",
      };
    }

    const validKeys = parseApiKeys(rawKeys);

    // Constant-time-ish comparison to resist timing attacks.
    // For production use, consider a proper constant-time comparison.
    const matched = validKeys.find((entry) => {
      if (entry.key.length !== providedKey.length) return false;
      let result = 0;
      for (let i = 0; i < entry.key.length; i++) {
        result |= entry.key.charCodeAt(i) ^ providedKey.charCodeAt(i);
      }
      return result === 0;
    });

    if (!matched) {
      return { authenticated: false, error: "Invalid API key" };
    }

    return {
      authenticated: true,
      user: {
        id: `apikey:${matched.label}`,
        roles: matched.roles,
        metadata: { keyLabel: matched.label, authMethod: "apikey" },
      },
    };
  },
};

// Self-register
registerProvider(apikeyProvider);

export { apikeyProvider };
