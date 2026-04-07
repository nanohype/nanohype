// ── Mock Auth Provider ───────────────────────────────────────────────
//
// Accepts any Bearer token matching the pattern `mock-*`. Extracts
// the userId from the token string (e.g. `mock-user-123` -> userId:
// `user-123`). Always returns authenticated: true with a mock user.
//
// Useful for local development and testing without configuring a
// real auth provider. Self-registers as "mock" on import.
//

import type { AuthResult } from "../types.js";
import type { AuthProvider, AuthRequest } from "./types.js";
import { registerProvider } from "./registry.js";

function extractBearerToken(request: AuthRequest): string | null {
  const header =
    typeof request.headers.get === "function"
      ? request.headers.get("authorization")
      : (request.headers["authorization"] as string | undefined);

  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

const mockProvider: AuthProvider = {
  name: "mock",

  async verifyRequest(request: AuthRequest): Promise<AuthResult> {
    const token = extractBearerToken(request);

    if (!token) {
      return { authenticated: false, error: "Missing Bearer token" };
    }

    if (!token.startsWith("mock-")) {
      return {
        authenticated: false,
        error: 'Mock provider only accepts tokens matching pattern "mock-*"',
      };
    }

    // Extract userId: everything after the first "mock-" prefix
    const userId = token.slice("mock-".length);

    return {
      authenticated: true,
      user: {
        id: userId,
        email: `${userId}@mock.local`,
        name: `Mock User (${userId})`,
        roles: ["user"],
        metadata: { provider: "mock", token },
      },
    };
  },
};

// Self-register
registerProvider("mock", () => mockProvider);

export { mockProvider };
