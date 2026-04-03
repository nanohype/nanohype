import { describe, it, expect } from "vitest";
import {
  registerExporter,
  getExporter,
  listExporters,
} from "../exporters/registry.js";
import type { LlmExporter } from "../exporters/types.js";

// ── Exporter Registry Tests ────────────────────────────────────────

function stubExporter(name: string): LlmExporter {
  return {
    name,
    exportSpan() {},
    exportCost() {},
    async flush() {},
  };
}

describe("LLM exporter registry", () => {
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
      /Unknown LLM exporter/,
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

  it("returns distinct instances from the factory", () => {
    const name = unique();

    registerExporter(name, () => stubExporter(name));

    const a = getExporter(name);
    const b = getExporter(name);

    // They should be structurally equal but not the same reference
    expect(a).not.toBe(b);
    expect(a.name).toBe(b.name);
  });
});
