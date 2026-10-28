import { build, context } from "esbuild";

/**
 * esbuild config for the Electron main process.
 *
 * Bundles src/main/index.ts and src/main/preload.ts into dist/main/.
 * Electron and Node.js built-ins are marked as external since they
 * are available at runtime without bundling.
 *
 * The main process runs on the Node release Electron embeds, not on the
 * toolchain `engines.node` names, so `target` is the Node major of the
 * `electron` major in package.json: Electron 45 embeds Node 24. Check
 * `target` whenever `electron` moves a major. With Electron installed, this
 * prints the release it embeds:
 *
 *   ELECTRON_RUN_AS_NODE=1 npx electron -p process.versions.node
 */

const isWatch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outdir: "dist/main",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
};

const entryPoints = ["src/main/index.ts", "src/main/preload.ts"];

if (isWatch) {
  const ctx = await context({ ...shared, entryPoints });
  await ctx.watch();
  console.log("Watching main process...");
} else {
  await build({ ...shared, entryPoints });
}
