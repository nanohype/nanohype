import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createDatabase,
  getDb,
  disconnectDatabase,
} from "../client.js";
import { registerDriver, getDriver } from "../drivers/registry.js";
import type { DatabaseDriver } from "../drivers/types.js";

/**
 * Register a fake driver that tracks connect/disconnect calls
 * without requiring a real database.
 */
function installFakeDriver(name: string) {
  const state = {
    connected: false,
    connectCalls: 0,
    disconnectCalls: 0,
    instance: { fake: true, driver: name },
  };

  const driver: DatabaseDriver = {
    name,
    async connect(_url: string) {
      state.connected = true;
      state.connectCalls++;
      return state.instance;
    },
    async disconnect() {
      state.connected = false;
      state.disconnectCalls++;
    },
  };

  // Only register if not already registered (avoids duplicate errors)
  try {
    registerDriver(driver);
  } catch {
    // already registered from a prior test — fine
  }

  return state;
}

// Each test needs a fresh driver name so the registry's already-registered
// branch doesn't leave a prior test's closure-captured state live in place of
// the current test's state object.
function freshDriverName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("createDatabase", () => {
  let driverName: string;
  let state: ReturnType<typeof installFakeDriver>;

  beforeEach(async () => {
    await disconnectDatabase();
    driverName = freshDriverName("fake");
    state = installFakeDriver(driverName);
  });

  it("connects using the named driver and returns the instance", async () => {
    const db = await createDatabase({ driver: driverName, url: "test://db" });

    expect(db).toBe(state.instance);
    expect(state.connectCalls).toBe(1);
  });

  it("disconnects the previous connection before re-connecting", async () => {
    await createDatabase({ driver: driverName, url: "test://first" });
    await createDatabase({ driver: driverName, url: "test://second" });

    expect(state.connectCalls).toBe(2);
    expect(state.disconnectCalls).toBe(1);
  });
});

describe("getDb", () => {
  let driverName: string;
  let state: ReturnType<typeof installFakeDriver>;

  beforeEach(async () => {
    await disconnectDatabase();
    driverName = freshDriverName("lazy");
    state = installFakeDriver(driverName);
  });

  it("lazy-initializes from environment when no connection exists", async () => {
    vi.stubEnv("DB_DRIVER", driverName);
    vi.stubEnv("DATABASE_URL", "test://lazy");

    const db = await getDb();

    expect(db).toBe(state.instance);
    expect(state.connectCalls).toBe(1);

    vi.unstubAllEnvs();
  });

  it("returns the same instance on subsequent calls (singleton)", async () => {
    vi.stubEnv("DB_DRIVER", driverName);
    vi.stubEnv("DATABASE_URL", "test://singleton");

    const first = await getDb();
    const second = await getDb();

    expect(first).toBe(second);
    expect(state.connectCalls).toBe(1);

    vi.unstubAllEnvs();
  });
});

describe("disconnectDatabase", () => {
  let driverName: string;
  let state: ReturnType<typeof installFakeDriver>;

  beforeEach(async () => {
    await disconnectDatabase();
    driverName = freshDriverName("disc");
    state = installFakeDriver(driverName);
  });

  it("calls disconnect on the active driver", async () => {
    await createDatabase({ driver: driverName, url: "test://disc" });
    await disconnectDatabase();

    expect(state.disconnectCalls).toBe(1);
  });

  it("is a no-op when no connection exists", async () => {
    await disconnectDatabase();

    expect(state.disconnectCalls).toBe(0);
  });
});
