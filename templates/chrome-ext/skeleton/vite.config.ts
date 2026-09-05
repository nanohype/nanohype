import { existsSync } from "fs";
import { resolve } from "path";
import { defineConfig, type Plugin } from "vite";

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

/**
 * Emit `manifest.json` from the bundle rather than shipping it as a static
 * file.
 *
 * A manifest is JSON and carries no conditional, so a checked-in one names
 * every entry in every build — including the ones this config just left out.
 * Chrome does not fail the install for that; it accepts the extension and the
 * options page opens blank, or the content script never runs, with nothing in
 * the manifest to say why. Naming each path from the chunk that produced it
 * means the manifest cannot name a file the build did not emit, and cannot
 * miss a hash the bundler chose.
 */
function manifestFromBundle(): Plugin {
  return {
    name: "manifest-from-bundle",
    generateBundle(_options, bundle) {
      const entry = (name: string) =>
        Object.values(bundle).find(
          (chunk) => chunk.type === "chunk" && chunk.isEntry && chunk.name === name,
        )?.fileName;

      /** The stylesheets an entry pulled in, as the bundler named them. */
      const styles = (name: string): string[] => {
        const chunk = Object.values(bundle).find(
          (c) => c.type === "chunk" && c.isEntry && c.name === name,
        );
        const css = chunk && "viteMetadata" in chunk ? chunk.viteMetadata?.importedCss : undefined;
        return css ? [...css] : [];
      };

      const manifest: Record<string, unknown> = {
        name: "__EXTENSION_NAME__",
        description: "__DESCRIPTION__",
        version: "0.1.0",
        manifest_version: 3,
        permissions: ["sidePanel", "storage", "activeTab"],
        side_panel: { default_path: "src/sidepanel/index.html" },
        background: { service_worker: entry("background"), type: "module" },
        icons: {
          16: "icons/icon-16.png",
          48: "icons/icon-48.png",
          128: "icons/icon-128.png",
        },
        action: { default_title: "__EXTENSION_NAME__" },
      };

      const content = entry("content");
      if (content) {
        manifest.content_scripts = [
          {
            matches: ["https://*/*", "http://*/*"],
            js: [content],
            ...(styles("content").length > 0 ? { css: styles("content") } : {}),
          },
        ];
      }

      if (input.options) {
        manifest.options_page = "src/options/index.html";
      }

      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [manifestFromBundle()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input,
      output: {
        entryFileNames: (chunkInfo) => {
          // Background and content scripts must be single files (IIFE-like)
          if (chunkInfo.name === "background" || chunkInfo.name === "content") {
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
