import { build, context } from "esbuild";

/**
 * esbuild config for the Electron main process.
 *
 * Bundles src/main/index.ts and src/main/preload.ts into dist/main/.
 * Electron and Node.js built-ins are marked as external since they
 * are available at runtime without bundling.
 */

const isWatch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
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
