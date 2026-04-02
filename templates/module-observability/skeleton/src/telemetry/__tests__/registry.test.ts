import { describe, it, expect } from "vitest";
import {
  registerExporter,
  getExporter,
  listExporters,
} from "../exporters/registry.js";
import type { TelemetryExporter } from "../exporters/types.js";

/**
 * Build a minimal stub exporter for testing the registry in isolation.
 */
function stubExporter(name: string): TelemetryExporter {
  return {
    name,
    createSpanExporter() {
      return undefined;
    },
    createMetricExporter() {
      return undefined;
    },
  };
}

describe("telemetry exporter registry", () => {
  const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers an exporter factory and retrieves it by name", () => {
    const name = unique();
    const exporter = stubExporter(name);

    registerExporter(name, () => exporter);

    const result = getExporter(name);
    expect(result).toEqual(exporter);
    expect(result.name).toBe(name);
  });

  it("throws when retrieving an unregistered exporter", () => {
    expect(() => getExporter("nonexistent-exporter")).toThrow(
      /Unknown telemetry exporter/,
    );
  });

  it("lists all registered exporter names", () => {
    const a = unique();
    const b = unique();

    registerExporter(a, () => stubExporter(a));
    registerExporter(b, () => stubExporter(b));

    const names = listExporters();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });

  it("calls the factory each time getExporter is invoked", () => {
    const name = unique();
    let callCount = 0;

    registerExporter(name, () => {
      callCount++;
      return stubExporter(name);
    });

    getExporter(name);
    getExporter(name);

    expect(callCount).toBe(2);
  });
});
