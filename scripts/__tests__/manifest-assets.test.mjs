import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extensionSkeletons, referencedPaths } from "../check-manifest-assets.mjs";

/**
 * The gate builds each render and compares the manifest against what the build
 * emitted. These pin the two readings it makes on the way: which skeletons are
 * extensions, and which strings in a manifest name a file.
 */

describe("referencedPaths", () => {
  it("names the files a manifest points at", () => {
    assert.deepEqual(
      referencedPaths({
        side_panel: { default_path: "src/sidepanel/index.html" },
        background: { service_worker: "background.js", type: "module" },
        options_page: "src/options/index.html",
        icons: { 16: "icons/icon-16.png" },
      }),
      ["background.js", "icons/icon-16.png", "src/options/index.html", "src/sidepanel/index.html"],
    );
  });

  it("names the files inside a content script entry", () => {
    assert.deepEqual(
      referencedPaths({
        content_scripts: [{ matches: ["https://*/*"], js: ["content.js"], css: ["content.css"] }],
      }),
      ["content.css", "content.js"],
    );
  });

  it("does not read a match pattern as a file", () => {
    // `https://*/*` ends in something that looks like an extension and is a
    // URL pattern. So does a host permission.
    assert.deepEqual(
      referencedPaths({
        content_scripts: [{ matches: ["https://*.example.com/*"], js: [] }],
        host_permissions: ["https://api.example.com/*"],
        permissions: ["storage", "activeTab"],
      }),
      [],
    );
  });

  it("does not read a plain value as a file", () => {
    assert.deepEqual(
      referencedPaths({
        name: "An Extension",
        version: "0.1.0",
        manifest_version: 3,
        action: { default_title: "An Extension" },
      }),
      [],
    );
  });
});

describe("extensionSkeletons", () => {
  it("finds the catalog's extension skeletons", () => {
    const found = extensionSkeletons();
    assert.ok(found.length > 0, "a gate over no extension reports the same as one over all");
    assert.ok(found.includes("chrome-ext"), "chrome-ext builds a manifest");
  });

  it("does not sweep in every skeleton that has a build", () => {
    // The marker is `manifest_version`, which the extension platform requires
    // and nobody here chooses. A skeleton that merely bundles is not an
    // extension, and building all of them would need every skeleton installed.
    const found = extensionSkeletons();
    for (const template of ["next-app", "ts-service", "electron-app"]) {
      assert.ok(!found.includes(template), `${template} is not an extension`);
    }
  });
});
