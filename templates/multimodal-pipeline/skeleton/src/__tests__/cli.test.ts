/**
 * Tests for how the CLI ends a failed run.
 *
 * A failed run sets exit code 1 and lets the process end on its own, so
 * work still pending when the run fails finishes before the process exits.
 * The suite runs the CLI in a child process on a file that does not exist,
 * with a preloaded module holding a timer open past the failure as that
 * pending work.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");

const PENDING_WORK =
  "data:text/javascript,setTimeout(() => console.log('pending work finished'), 300);";

describe("CLI", () => {
  it("exits 1 on a failed run, after the work still pending has finished", () => {
    const run = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--import",
        PENDING_WORK,
        "src/index.ts",
        "process",
        resolve(ROOT, "no-such-file.mp3"),
      ],
      { cwd: ROOT, encoding: "utf8", timeout: 60_000 },
    );

    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/"message":"Fatal error"/);
    expect(run.stdout).toContain("pending work finished");
  });
});
