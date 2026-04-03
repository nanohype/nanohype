import type { Flag } from "../types.js";
import type { FlagStore } from "./types.js";
import { registerStore } from "./registry.js";

// ── Mock Flag Store ─────────────────────────────────────────────────
//
// Deterministic flag store for testing. Pre-loaded with a set of
// flags that exercise common evaluation paths: boolean toggles,
// percentage rollouts, allowlists, and property rules. Each factory
// call produces an independent instance with fresh copies of the
// seed data.
//

function seedFlags(): Flag[] {
  const now = new Date().toISOString();
  return [
    {
      key: "new-checkout",
      name: "New Checkout Flow",
      description: "Enables the redesigned checkout experience",
      enabled: true,
      type: "boolean",
      variants: [
        { name: "control", value: false },
        { name: "treatment", value: true },
      ],
      rules: [
        { type: "percentage", percentage: 50, variant: "treatment" },
      ],
      defaultVariant: "control",
      createdAt: now,
      updatedAt: now,
    },
    {
      key: "beta-features",
      name: "Beta Features",
      description: "Grants access to beta features for allowlisted users",
      enabled: true,
      type: "boolean",
      variants: [
        { name: "off", value: false },
        { name: "on", value: true },
      ],
      rules: [
        { type: "allowlist", userIds: ["user-1", "user-2", "user-3"], variant: "on" },
      ],
      defaultVariant: "off",
      createdAt: now,
      updatedAt: now,
    },
    {
      key: "disabled-flag",
      name: "Disabled Flag",
      enabled: false,
      type: "boolean",
      variants: [
        { name: "off", value: false },
        { name: "on", value: true },
      ],
      rules: [],
      defaultVariant: "off",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function createMockStore(): FlagStore {
  const store = new Map<string, Flag>();

  return {
    name: "mock",

    async init(): Promise<void> {
      store.clear();
      for (const flag of seedFlags()) {
        store.set(flag.key, flag);
      }
    },

    async getFlag(key: string): Promise<Flag | undefined> {
      return store.get(key);
    },

    async setFlag(flag: Flag): Promise<void> {
      store.set(flag.key, { ...flag, updatedAt: new Date().toISOString() });
    },

    async listFlags(): Promise<Flag[]> {
      return Array.from(store.values());
    },

    async deleteFlag(key: string): Promise<void> {
      store.delete(key);
    },

    async close(): Promise<void> {
      store.clear();
    },
  };
}

// Self-register
registerStore("mock", createMockStore);
