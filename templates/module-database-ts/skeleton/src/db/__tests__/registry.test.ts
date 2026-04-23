import { describe, it, expect } from "vitest";
import {
  registerDriver,
  getDriver,
  listDrivers,
} from "../drivers/registry.js";
import type { DatabaseDriver } from "../drivers/types.js";

/**
 * Build a minimal stub driver for testing the registry in isolation.
 */
function stubDriver(name: string): DatabaseDriver {
  return {
    name,
    async connect(_url: string) {
      return { stub: true };
    },
    async disconnect() {},
  };
}

describe("database driver registry", () => {
  const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a driver and retrieves it by name", () => {
    const name = unique();
    const driver = stubDriver(name);

    registerDriver(driver);

    expect(getDriver(name)).toBe(driver);
  });

  it("throws when retrieving an unregistered driver", () => {
    expect(() => getDriver("nonexistent-driver")).toThrow(
      /not found/,
    );
  });

  it("throws when registering a duplicate driver name", () => {
    const name = unique();
    registerDriver(stubDriver(name));

    expect(() => registerDriver(stubDriver(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered driver names", () => {
    const a = unique();
    const b = unique();

    registerDriver(stubDriver(a));
    registerDriver(stubDriver(b));

    const names = listDrivers();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });
});
