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

// #if IncludeWebview && IncludeAi
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
// #endif

async function build() {
  try {
    // The webview bundle is built only when this project includes the React
    // panel; the extension host bundle is always built.
    const configs = [extensionConfig];
    // #if IncludeWebview && IncludeAi
    configs.push(webviewConfig);
    // #endif

    if (isWatch) {
      const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
      await Promise.all(contexts.map((c) => c.watch()));
      console.log("[esbuild] watching for changes...");
    } else {
      await Promise.all(configs.map((c) => esbuild.build(c)));
      console.log("[esbuild] build complete");
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

// `build` handles its own failures and exits non-zero, so nothing is left to
// await here — `void` says that on purpose rather than by omission.
void build();
