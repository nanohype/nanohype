import { existsSync } from "fs";
import { resolve } from "path";
import { defineConfig } from "vite";

/**
 * Multi-entry Vite config for Chrome Extension (Manifest V3).
 *
 * Builds separate bundles per entry point:
 *   - sidepanel: React app served as the side panel UI
 *   - background: Service worker (IIFE, no code splitting)
 *   - content: Content script injected into pages (IIFE, no code splitting)
 *   - options: React app for extension settings
 *
 * Content script and options page entries are conditional — they are
 * only included if their source files exist. Remove the corresponding
 * src/ directories to exclude them from the build.
 *
 * No Chrome extension Vite plugin is used — a manual multi-entry
 * configuration is more stable across Vite major versions and gives
 * full control over output format per entry point.
 */

const input: Record<string, string> = {
  sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
  background: resolve(__dirname, "src/background/index.ts"),
};

const contentEntry = resolve(__dirname, "src/content/index.ts");
if (existsSync(contentEntry)) {
  input.content = contentEntry;
}

const optionsEntry = resolve(__dirname, "src/options/index.html");
if (existsSync(optionsEntry)) {
  input.options = optionsEntry;
}

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input,
      output: {
        entryFileNames: (chunkInfo) => {
          // Background and content scripts must be single files (IIFE-like)
          if (
            chunkInfo.name === "background" ||
            chunkInfo.name === "content"
          ) {
            return "[name].js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        // No hashes on asset filenames — Chrome extensions reference assets
        // by exact path in the manifest and don't benefit from cache busting.
        assetFileNames: "[name].[ext]",
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
