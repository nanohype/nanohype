import { describe, it, expect } from "vitest";
import { TransformBuilder } from "../transforms/builder.js";

// ── TransformBuilder Tests ──────────────────────────────────────
//
// Validates the fluent chain produces correct TransformOptions and
// that each method returns a new builder (immutability).
//

describe("TransformBuilder", () => {
  it("builds an empty TransformOptions by default", () => {
    const opts = new TransformBuilder().build();
    expect(opts).toEqual({});
  });

  it("sets width", () => {
    const opts = new TransformBuilder().width(200).build();
    expect(opts.width).toBe(200);
  });

  it("sets height", () => {
    const opts = new TransformBuilder().height(150).build();
    expect(opts.height).toBe(150);
  });

  it("sets fit mode", () => {
    const opts = new TransformBuilder().fit("cover").build();
    expect(opts.fit).toBe("cover");
  });

  it("sets format", () => {
    const opts = new TransformBuilder().format("webp").build();
    expect(opts.format).toBe("webp");
  });

  it("sets quality", () => {
    const opts = new TransformBuilder().quality(80).build();
    expect(opts.quality).toBe(80);
  });

  it("chains all options together", () => {
    const opts = new TransformBuilder()
      .width(200)
      .height(200)
      .fit("cover")
      .format("webp")
      .quality(80)
      .build();

    expect(opts).toEqual({
      width: 200,
      height: 200,
      fit: "cover",
      format: "webp",
      quality: 80,
    });
  });

  describe("immutability", () => {
    it("returns a new builder on each method call", () => {
      const a = new TransformBuilder();
      const b = a.width(100);
      const c = b.height(200);

      expect(a).not.toBe(b);
      expect(b).not.toBe(c);
    });

    it("does not mutate the original builder", () => {
      const original = new TransformBuilder().width(100).height(100);
      const modified = original.width(500);

      expect(original.build().width).toBe(100);
      expect(modified.build().width).toBe(500);
    });

    it("allows branching from the same builder", () => {
      const base = new TransformBuilder().width(200).height(200);
      const webp = base.format("webp").build();
      const avif = base.format("avif").build();

      expect(webp.format).toBe("webp");
      expect(avif.format).toBe("avif");
      expect(webp.width).toBe(200);
      expect(avif.width).toBe(200);
    });
  });

  describe("validation", () => {
    it("throws RangeError for quality below 1", () => {
      expect(() => new TransformBuilder().quality(0)).toThrow(RangeError);
    });

    it("throws RangeError for quality above 100", () => {
      expect(() => new TransformBuilder().quality(101)).toThrow(RangeError);
    });

    it("accepts quality at boundaries (1 and 100)", () => {
      expect(new TransformBuilder().quality(1).build().quality).toBe(1);
      expect(new TransformBuilder().quality(100).build().quality).toBe(100);
    });
  });

  it("accepts initial TransformOptions in constructor", () => {
    const opts = new TransformBuilder({ width: 300, format: "png" })
      .height(200)
      .build();

    expect(opts.width).toBe(300);
    expect(opts.height).toBe(200);
    expect(opts.format).toBe("png");
  });
});
