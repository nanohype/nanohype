const esbuild = require("esbuild");
const path = require("path");

const isWatch = process.argv.includes("--watch");

/** Extension host bundle — runs in Node, excludes vscode */
const extensionConfig = {
  entryPoints: [path.resolve(__dirname, "src/extension.ts")],
  bundle: true,
  outfile: path.resolve(__dirname, "dist/extension.js"),
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: true,
  minify: false,
};

/** Webview bundle — runs in browser, React app */
const webviewConfig = {
  entryPoints: [path.resolve(__dirname, "src/webview/app/index.tsx")],
  bundle: true,
  outfile: path.resolve(__dirname, "dist/webview/app.js"),
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  minify: false,
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"development"',
  },
};

async function build() {
  try {
    if (isWatch) {
      const extCtx = await esbuild.context(extensionConfig);
      const webCtx = await esbuild.context(webviewConfig);
      await Promise.all([extCtx.watch(), webCtx.watch()]);
      console.log("[esbuild] watching for changes...");
    } else {
      await Promise.all([
        esbuild.build(extensionConfig),
        esbuild.build(webviewConfig),
      ]);
      console.log("[esbuild] build complete");
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

build();
