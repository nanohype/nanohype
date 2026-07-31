/**
 * Locating the CLI inside @nanohype/sdk.
 *
 * The SDK publishes the actual command as its `nanohype` bin, and its `exports`
 * map declares only `"."` — so the bin is not reachable as a subpath import.
 * Resolving the package's own entry and walking to the bin beside it uses a
 * filesystem path, which `exports` does not gate.
 *
 * Split out from the entry point so the path arithmetic is testable without
 * spawning anything: that arithmetic is the whole of what can silently break
 * when the SDK changes its layout.
 */

import { dirname, join } from "node:path";

/** Resolves a module specifier to a file path — `require.resolve` in practice. */
export type Resolver = (specifier: string) => string;

/**
 * The SDK's bin, derived from wherever its entry point resolved to.
 *
 * `.../@nanohype/sdk/dist/index.js` → `.../@nanohype/sdk/dist/bin/nanohype.js`
 */
export function resolveSdkCli(resolve: Resolver): string {
  return join(dirname(resolve("@nanohype/sdk")), "bin", "nanohype.js");
}

/**
 * What to tell someone whose install is missing the SDK. Named rather than
 * inlined so the entry point stays about process control, and so the message
 * itself can be asserted — an install-repair instruction that goes stale is
 * worse than none.
 */
export function missingSdkMessage(err: unknown): string {
  const detail = describeThrown(err);
  return [
    "nanohype: could not locate @nanohype/sdk, which provides the CLI.",
    "Reinstall this package, or run the SDK directly with `npx @nanohype/sdk`.",
    `Underlying error: ${detail}`,
  ].join("\n");
}

/**
 * Render a thrown value for a human.
 *
 * `require.resolve` throws Errors, but this is the failure path and nothing on
 * it is guaranteed. `String(value)` on a plain object yields "[object Object]",
 * which is worse than useless at the moment someone most needs the detail — so
 * objects go through JSON, and anything JSON cannot represent (a cycle, a
 * BigInt) falls back rather than throwing a second error over the first.
 */
function describeThrown(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    try {
      return JSON.stringify(err);
    } catch {
      return Object.prototype.toString.call(err);
    }
  }
  return String(err);
}
