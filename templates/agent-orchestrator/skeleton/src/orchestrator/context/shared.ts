// ── Shared Context ──────────────────────────────────────────────────
//
// Key-value store with namespacing that accumulates between subtask
// executions. Agents read what previous agents wrote. Each namespace
// isolates an agent's writes so they don't collide with other agents.
//
// Factory function returns a fresh context instance — no module-level
// mutable state.
//

export interface SharedContext {
  /** Get a value by key. Returns undefined if not found. */
  get(key: string): unknown;

  /** Get a value within a namespace. */
  getNamespaced(namespace: string, key: string): unknown;

  /** Set a value by key (global namespace). */
  set(key: string, value: unknown): void;

  /** Set a value within a namespace. */
  setNamespaced(namespace: string, key: string, value: unknown): void;

  /** Get all key-value pairs in the global namespace. */
  getAll(): Record<string, unknown>;

  /** Get all key-value pairs within a namespace. */
  getAllNamespaced(namespace: string): Record<string, unknown>;

  /** List all namespaces that have data. */
  listNamespaces(): string[];

  /** Clear all data across all namespaces. */
  clear(): void;

  /**
   * Create a scoped view of the context for a specific agent.
   * The agent can read from the global namespace and write to its
   * own namespace. Reads from the agent's namespace are also
   * available.
   */
  scopedFor(agentName: string): ScopedContext;
}

export interface ScopedContext {
  /** Get a value from global or agent-scoped namespace. */
  get(key: string): unknown;

  /** Set a value in the agent's namespace. Also visible globally. */
  set(key: string, value: unknown): void;

  /** Get all values visible to this agent (global + own namespace). */
  getAll(): Record<string, unknown>;
}

/**
 * Create a new shared context instance.
 * Each call returns an independent context with its own storage.
 */
export function createSharedContext(): SharedContext {
  const global = new Map<string, unknown>();
  const namespaces = new Map<string, Map<string, unknown>>();

  function getNamespace(ns: string): Map<string, unknown> {
    let nsMap = namespaces.get(ns);
    if (!nsMap) {
      nsMap = new Map();
      namespaces.set(ns, nsMap);
    }
    return nsMap;
  }

  return {
    get(key: string): unknown {
      return global.get(key);
    },

    getNamespaced(namespace: string, key: string): unknown {
      return namespaces.get(namespace)?.get(key);
    },

    set(key: string, value: unknown): void {
      global.set(key, value);
    },

    setNamespaced(namespace: string, key: string, value: unknown): void {
      getNamespace(namespace).set(key, value);
    },

    getAll(): Record<string, unknown> {
      return Object.fromEntries(global);
    },

    getAllNamespaced(namespace: string): Record<string, unknown> {
      const nsMap = namespaces.get(namespace);
      return nsMap ? Object.fromEntries(nsMap) : {};
    },

    listNamespaces(): string[] {
      return Array.from(namespaces.keys());
    },

    clear(): void {
      global.clear();
      namespaces.clear();
    },

    scopedFor(agentName: string): ScopedContext {
      return {
        get(key: string): unknown {
          // Check agent namespace first, then global
          const nsValue = getNamespace(agentName).get(key);
          if (nsValue !== undefined) return nsValue;
          return global.get(key);
        },

        set(key: string, value: unknown): void {
          // Write to both agent namespace and global
          getNamespace(agentName).set(key, value);
          global.set(key, value);
        },

        getAll(): Record<string, unknown> {
          return {
            ...Object.fromEntries(global),
            ...Object.fromEntries(getNamespace(agentName)),
          };
        },
      };
    },
  };
}
