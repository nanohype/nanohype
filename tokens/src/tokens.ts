/**
 * The typed mirror of `tokens.css`.
 *
 * CSS custom properties are invisible to TypeScript: a chart library that needs
 * the primary colour, a canvas that has to paint a status hue, an `<svg fill>`
 * — none of them can read a Tailwind utility, and all of them would otherwise
 * hardcode `#3e8e82` somewhere the CSS does not know about. That is the exact
 * drift a token layer exists to prevent, so the values live here as well.
 *
 * Two copies of anything need something holding them together. `parity.test.ts`
 * parses the CSS and fails when a token is in one and not the other, or when a
 * value disagrees. Add a token to the CSS and the test tells you to add it here.
 */

/** Colour tokens in the dark default. `light` carries the same keys. */
export const colors = {
  background: "#0a0a0b",
  foreground: "#ededef",
  card: "#111113",
  "card-foreground": "#ededef",
  popover: "#111113",
  "popover-foreground": "#ededef",
  primary: "#3e8e82",
  "primary-foreground": "#ffffff",
  secondary: "#1a1a1d",
  "secondary-foreground": "#ededef",
  muted: "#1a1a1d",
  "muted-foreground": "#7e7e85",
  accent: "#1a1a1d",
  "accent-foreground": "#ededef",
  destructive: "#cf222e",
  "destructive-foreground": "#ededef",
  border: "rgba(255, 255, 255, 0.06)",
  input: "#161618",
  "input-border": "rgba(255, 255, 255, 0.08)",
  ring: "#3e8e82",
  success: "#2da44e",
  warning: "#d4a72c",
  dim: "#52525a",
  hover: "rgba(255, 255, 255, 0.04)",
  scrollbar: "rgba(255, 255, 255, 0.16)",
  "scrollbar-hover": "rgba(255, 255, 255, 0.3)",
} as const;

/**
 * The light overrides. Same keys as {@link colors} — the parity test enforces
 * that, because a colour defined in only one theme is a surface that silently
 * keeps its dark value when the user flips the toggle.
 */
export const light = {
  background: "#fbfbfc",
  foreground: "#1a1a1f",
  card: "#ffffff",
  "card-foreground": "#1a1a1f",
  popover: "#ffffff",
  "popover-foreground": "#1a1a1f",
  primary: "#2f7a6e",
  "primary-foreground": "#ffffff",
  secondary: "#f2f2f4",
  "secondary-foreground": "#1a1a1f",
  muted: "#f2f2f4",
  "muted-foreground": "#5c5c66",
  accent: "#f0f0f3",
  "accent-foreground": "#1a1a1f",
  destructive: "#c5221c",
  "destructive-foreground": "#ffffff",
  border: "rgba(17, 17, 20, 0.1)",
  input: "#ffffff",
  "input-border": "rgba(17, 17, 20, 0.14)",
  ring: "#2f7a6e",
  success: "#1a7f37",
  warning: "#9a6700",
  dim: "#8b8b93",
  hover: "rgba(17, 17, 20, 0.045)",
  scrollbar: "rgba(17, 17, 20, 0.18)",
  "scrollbar-hover": "rgba(17, 17, 20, 0.34)",
} as const;

/** Corner radii. */
export const radius = {
  sm: "0.25rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.625rem",
} as const;

/** Type stacks. Sans for UI, mono for ids, SHAs, regions and logs. */
export const fonts = {
  sans: '"Inter", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

/**
 * Motion. One scale so transitions stay consistent: `out-expo` is the
 * expressive enter curve, `out` handles smaller state changes.
 */
export const easing = {
  "out-expo": "cubic-bezier(0.32, 0.72, 0, 1)",
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

export const duration = {
  fast: "120ms",
  base: "180ms",
  slow: "260ms",
} as const;

export type ColorToken = keyof typeof colors;
export type RadiusToken = keyof typeof radius;
export type FontToken = keyof typeof fonts;
export type EasingToken = keyof typeof easing;
export type DurationToken = keyof typeof duration;

/** Every token, grouped — the shape a consumer usually wants. */
export const tokens = { colors, light, radius, fonts, easing, duration } as const;
