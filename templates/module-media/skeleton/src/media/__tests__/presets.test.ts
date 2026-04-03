import { describe, it, expect } from "vitest";
import {
  thumbnail,
  avatar,
  hero,
  ogImage,
  responsive,
  RESPONSIVE_WIDTHS,
  PRESETS,
  getPreset,
  listPresets,
} from "../transforms/presets.js";

// ── Preset Tests ─────────────────────────────────────────────────
//
// Each preset produces correct TransformOptions with the expected
// dimensions, fit mode, and metadata.
//

describe("transform presets", () => {
  describe("thumbnail", () => {
    it("produces 150x150 cover", () => {
      expect(thumbnail.name).toBe("thumbnail");
      expect(thumbnail.options.width).toBe(150);
      expect(thumbnail.options.height).toBe(150);
      expect(thumbnail.options.fit).toBe("cover");
    });
  });

  describe("avatar", () => {
    it("produces 80x80 cover", () => {
      expect(avatar.name).toBe("avatar");
      expect(avatar.options.width).toBe(80);
      expect(avatar.options.height).toBe(80);
      expect(avatar.options.fit).toBe("cover");
    });
  });

  describe("hero", () => {
    it("produces 1920x1080 contain", () => {
      expect(hero.name).toBe("hero");
      expect(hero.options.width).toBe(1920);
      expect(hero.options.height).toBe(1080);
      expect(hero.options.fit).toBe("contain");
    });
  });

  describe("og-image", () => {
    it("produces 1200x630 contain", () => {
      expect(ogImage.name).toBe("og-image");
      expect(ogImage.options.width).toBe(1200);
      expect(ogImage.options.height).toBe(630);
      expect(ogImage.options.fit).toBe("contain");
    });
  });

  describe("responsive", () => {
    it("produces 1920 wide scale", () => {
      expect(responsive.name).toBe("responsive");
      expect(responsive.options.width).toBe(1920);
      expect(responsive.options.fit).toBe("scale");
    });

    it("defines standard srcset widths", () => {
      expect(RESPONSIVE_WIDTHS).toEqual([320, 640, 960, 1280, 1920]);
    });
  });

  describe("PRESETS map", () => {
    it("contains all five presets", () => {
      expect(PRESETS.size).toBe(5);
      expect(PRESETS.has("thumbnail")).toBe(true);
      expect(PRESETS.has("avatar")).toBe(true);
      expect(PRESETS.has("hero")).toBe(true);
      expect(PRESETS.has("og-image")).toBe(true);
      expect(PRESETS.has("responsive")).toBe(true);
    });
  });

  describe("getPreset", () => {
    it("returns a preset by name", () => {
      const preset = getPreset("thumbnail");
      expect(preset).toBeDefined();
      expect(preset!.name).toBe("thumbnail");
    });

    it("returns undefined for unknown presets", () => {
      expect(getPreset("nonexistent")).toBeUndefined();
    });
  });

  describe("listPresets", () => {
    it("returns all preset names", () => {
      const names = listPresets();
      expect(names).toContain("thumbnail");
      expect(names).toContain("avatar");
      expect(names).toContain("hero");
      expect(names).toContain("og-image");
      expect(names).toContain("responsive");
      expect(names).toHaveLength(5);
    });
  });
});
