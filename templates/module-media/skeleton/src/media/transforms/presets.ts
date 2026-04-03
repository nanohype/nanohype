// ── Transform Presets ────────────────────────────────────────────
//
// Named transform presets for common image use cases. Each preset
// is a TransformPreset with a name, label, and TransformOptions.
// Import individual presets or the full PRESETS map.
//

import type { TransformPreset, TransformOptions } from "../types.js";

/** 150x150 cover crop -- small square for lists and grids. */
export const thumbnail: TransformPreset = {
  name: "thumbnail",
  label: "Thumbnail",
  options: { width: 150, height: 150, fit: "cover" },
};

/** 80x80 cover crop -- small circle/square for user avatars. */
export const avatar: TransformPreset = {
  name: "avatar",
  label: "Avatar",
  options: { width: 80, height: 80, fit: "cover" },
};

/** 1920x1080 contain -- full-width hero banner. */
export const hero: TransformPreset = {
  name: "hero",
  label: "Hero",
  options: { width: 1920, height: 1080, fit: "contain" },
};

/** 1200x630 contain -- Open Graph / social share image. */
export const ogImage: TransformPreset = {
  name: "og-image",
  label: "OG Image",
  options: { width: 1200, height: 630, fit: "contain" },
};

/** Responsive srcset widths [320, 640, 960, 1280, 1920]. */
export const responsive: TransformPreset = {
  name: "responsive",
  label: "Responsive",
  options: { width: 1920, fit: "scale" },
};

/** Default responsive srcset widths. */
export const RESPONSIVE_WIDTHS = [320, 640, 960, 1280, 1920] as const;

/** All presets indexed by name. */
export const PRESETS: ReadonlyMap<string, TransformPreset> = new Map([
  [thumbnail.name, thumbnail],
  [avatar.name, avatar],
  [hero.name, hero],
  [ogImage.name, ogImage],
  [responsive.name, responsive],
]);

/** Get a preset by name, or undefined if not found. */
export function getPreset(name: string): TransformPreset | undefined {
  return PRESETS.get(name);
}

/** List all available preset names. */
export function listPresets(): string[] {
  return Array.from(PRESETS.keys());
}
