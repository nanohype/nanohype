#!/usr/bin/env node
/**
 * `nanohype` — the unscoped entry point for the nanohype CLI.
 *
 * The command itself lives in @nanohype/sdk. This package exists so
 * `npx nanohype` reaches it: npm's unscoped namespace is separate from the
 * @nanohype scope, and a name left unclaimed there is a name someone else can
 * publish under.
 *
 * Runs the SDK's bin as a child process rather than importing it, so its argv,
 * exit code and signals are its own and this wrapper stays invisible.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { missingSdkMessage, resolveSdkCli } from "../resolve.js";

const require = createRequire(import.meta.url);

let cli: string;
try {
  cli = resolveSdkCli(require.resolve);
} catch (err) {
  console.error(missingSdkMessage(err));
  process.exit(1);
}

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("error", (err) => {
  console.error(`nanohype: failed to start the CLI: ${err.message}`);
  process.exit(1);
});

// Re-raise the child's signal rather than translating it into an exit code, so
// a caller that killed the pipeline sees the death it asked for.
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
