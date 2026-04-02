/**
 * Shared UI components for the __PROJECT_NAME__ monorepo.
 *
 * This package is a starting point for shared UI primitives. Add your
 * component framework of choice (React, Solid, Svelte, etc.) and export
 * reusable components from here.
 */

/**
 * Placeholder component type -- replace with your UI framework's component type.
 */
export type Component<P = Record<string, unknown>> = (props: P) => unknown;

/**
 * Shared design-token constants. Extend with your own palette, spacing, etc.
 */
export const tokens = {
  colors: {
    primary: "#0f172a",
    secondary: "#64748b",
    accent: "#3b82f6",
    background: "#ffffff",
    surface: "#f8fafc",
    error: "#ef4444",
    success: "#22c55e",
  },
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },
  radii: {
    sm: "0.25rem",
    md: "0.5rem",
    lg: "1rem",
    full: "9999px",
  },
} as const;
