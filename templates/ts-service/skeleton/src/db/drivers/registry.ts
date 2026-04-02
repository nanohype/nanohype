import type { DatabaseDriver } from "./types.js";

// ── Driver Registry ──────────────────────────────────────────────────
//
// Central registry for database drivers. Each driver module
// self-registers by calling registerDriver() at import time.
// Consumer code calls getDriver() to obtain the active driver.
//

const drivers = new Map<string, DatabaseDriver>();

export function registerDriver(driver: DatabaseDriver): void {
  if (drivers.has(driver.name)) {
    throw new Error(`Database driver "${driver.name}" is already registered`);
  }
  drivers.set(driver.name, driver);
}

export function getDriver(name: string): DatabaseDriver {
  const driver = drivers.get(name);
  if (!driver) {
    const available = Array.from(drivers.keys()).join(", ") || "(none)";
    throw new Error(
      `Database driver "${name}" not found. Available: ${available}`
    );
  }
  return driver;
}

export function listDrivers(): string[] {
  return Array.from(drivers.keys());
}
