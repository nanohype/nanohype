import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, disconnectDatabase, getDb } from "../client.js";
import { getDriver, registerDriver } from "../drivers/registry.js";
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

/**
 * getDb() picks a driver from the environment when the caller does not name
 * one. That resolution is the seam a scaffolded project actually runs through —
 * DATABASE_URL is set by the platform, not by application code — so each shape
 * it recognises is asserted rather than assumed.
 *
 * The built-in drivers are already registered, so these stub the real driver's
 * connect rather than registering a fake under a name that is taken.
 */
describe("driver resolution from the environment", () => {
  const saved = { driver: process.env.DB_DRIVER, url: process.env.DATABASE_URL };

  beforeEach(async () => {
    await disconnectDatabase();
    // Assigning undefined to a process.env property stores the string
    // "undefined", which resolveDriverName would happily return.
    delete process.env.DB_DRIVER;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (saved.driver === undefined) delete process.env.DB_DRIVER;
    else process.env.DB_DRIVER = saved.driver;
    if (saved.url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved.url;
  });

  it("prefers an explicit DB_DRIVER over the URL scheme", async () => {
    const name = freshDriverName("explicit");
    const state = installFakeDriver(name);
    process.env.DB_DRIVER = name;
    process.env.DATABASE_URL = "postgres://ignored/db";

    await getDb();

    expect(state.connectCalls).toBe(1);
  });

  it.each([
    ["postgres://user@host/db", "postgres"],
    ["libsql://host.turso.io", "turso"],
    ["https://host.turso.io", "turso"],
    ["file:./local.db", "sqlite"],
    ["sqlite://./local.db", "sqlite"],
  ])("resolves %s to the %s driver", async (url, expected) => {
    const connect = vi.spyOn(getDriver(expected), "connect").mockResolvedValue({ stub: expected });
    process.env.DATABASE_URL = url;

    await getDb();

    // The driver takes an optional second argument; assert the URL it was
    // handed, not the whole call shape.
    expect(connect.mock.calls[0]?.[0]).toBe(url);
  });

  it("returns the live instance without reconnecting", async () => {
    const name = freshDriverName("singleton");
    const state = installFakeDriver(name);
    process.env.DB_DRIVER = name;

    const first = await getDb();
    const second = await getDb();

    expect(second).toBe(first);
    expect(state.connectCalls).toBe(1);
  });
});
