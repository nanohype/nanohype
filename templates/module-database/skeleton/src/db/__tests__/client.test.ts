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

describe("createDatabase", () => {
  const driverName = `fake-${Date.now()}`;
  let state: ReturnType<typeof installFakeDriver>;

  beforeEach(async () => {
    // Disconnect any existing singleton so tests are independent
    await disconnectDatabase();
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
  const driverName = `lazy-${Date.now()}`;
  let state: ReturnType<typeof installFakeDriver>;

  beforeEach(async () => {
    await disconnectDatabase();
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
  const driverName = `disc-${Date.now()}`;
  let state: ReturnType<typeof installFakeDriver>;

  beforeEach(async () => {
    await disconnectDatabase();
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
