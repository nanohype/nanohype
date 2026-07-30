import { describe, expect, it } from "vitest";
import { type Component, tokens } from "./index.js";

// ── shared-ui ─────────────────────────────────────────────────────
//
// This package is a starting point: a `Component` type to be replaced by a real
// framework's, and the design tokens every other package renders against. There
// is no behaviour to test yet, so what is worth pinning is the token contract —
// tokens are consumed by string interpolation into CSS, where a malformed value
// produces no error at all, just a rule the browser drops.

describe("design tokens", () => {
  it("exposes the three token groups packages consume", () => {
    expect(Object.keys(tokens).sort()).toEqual(["colors", "radii", "spacing"]);
  });

  it("declares every colour as a six-digit hex value", () => {
    // `#0f172a` and `#0f172` are both truthy strings, and only one of them is a
    // colour. CSS silently ignores the other.
    for (const [name, value] of Object.entries(tokens.colors)) {
      expect(value, `colors.${name}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("declares every spacing and radius with a CSS unit", () => {
    // A bare number is the mistake this catches: `spacing.md: "1"` interpolates
    // into `padding: 1`, which is invalid and dropped, so the layout is subtly
    // wrong with nothing logged anywhere.
    for (const [name, value] of Object.entries(tokens.spacing)) {
      expect(value, `spacing.${name}`).toMatch(/^\d*\.?\d+(rem|em|px|%)$/);
    }
    for (const [name, value] of Object.entries(tokens.radii)) {
      expect(value, `radii.${name}`).toMatch(/^\d*\.?\d+(rem|em|px|%)$/);
    }
  });

  it("orders the spacing scale monotonically", () => {
    // A scale is only a scale if it increases. Swapping two values is easy to do
    // and impossible to see in a diff of a token file.
    const rem = (v: string) => Number.parseFloat(v);
    const scale = [
      tokens.spacing.xs,
      tokens.spacing.sm,
      tokens.spacing.md,
      tokens.spacing.lg,
      tokens.spacing.xl,
    ].map(rem);
    for (let i = 1; i < scale.length; i++) {
      expect(scale[i], `step ${i}`).toBeGreaterThan(scale[i - 1] as number);
    }
  });

  it("keeps radii.full effectively unbounded", () => {
    // The pill-shape idiom. A small number here rounds corners slightly instead
    // of producing a pill, which reads as a design choice rather than a bug.
    expect(Number.parseFloat(tokens.radii.full)).toBeGreaterThanOrEqual(9999);
  });
});

describe("Component", () => {
  it("types a props-taking function", () => {
    // The placeholder type is what downstream packages import until a real
    // framework lands. This asserts it still accepts the shape it advertises,
    // so replacing it is a deliberate edit rather than a silent widening.
    const Greeting: Component<{ name: string }> = (props) => `hello ${props.name}`;
    expect(Greeting({ name: "world" })).toBe("hello world");

    const Empty: Component = () => null;
    expect(Empty({})).toBeNull();
  });
});
