// ── InMemoryTokenStorage ─────────────────────────────────────────────
//
// Volatile, single-process storage. Good for tests and local dev.
// Do not use in production — tokens vanish on restart.

import type { TokenGrant, TokenStorage } from "./types.js";

export class InMemoryTokenStorage implements TokenStorage {
  private readonly byUser = new Map<string, Map<string, TokenGrant>>();

  async get(userId: string, provider: string): Promise<TokenGrant | null> {
    return this.byUser.get(userId)?.get(provider) ?? null;
  }

  async put(userId: string, provider: string, grant: TokenGrant): Promise<void> {
    let inner = this.byUser.get(userId);
    if (!inner) {
      inner = new Map();
      this.byUser.set(userId, inner);
    }
    inner.set(provider, grant);
  }

  async delete(userId: string, provider: string): Promise<void> {
    const inner = this.byUser.get(userId);
    if (!inner) return;
    inner.delete(provider);
    if (inner.size === 0) this.byUser.delete(userId);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    this.byUser.delete(userId);
  }

  /** Test-only: count stored grants (total across all users). */
  _size(): number {
    let n = 0;
    for (const inner of this.byUser.values()) n += inner.size;
    return n;
  }
}
