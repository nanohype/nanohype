import type { Command } from "commander";
import { lint } from "../../operations/lint.js";
import type { LintIssue } from "../../operations/types.js";

const SEVERITY_COLORS: Record<LintIssue["severity"], string> = {
  error: "\x1b[31m",
  warning: "\x1b[33m",
  info: "\x1b[36m",
};

const RESET = "\x1b[0m";

export function registerLintCommand(program: Command): void {
  program
    .command("lint <tenant-id>")
    .description("Check wiki health and find issues")
    .action(async (tenantId: string) => {
      try {
        const result = await lint(tenantId);

        console.log(`Checked ${result.pagesChecked} pages.\n`);

        if (result.issues.length === 0) {
          console.log("No issues found.");
          return;
        }

        for (const issue of result.issues) {
          const color = SEVERITY_COLORS[issue.severity];
          const tag = `[${issue.severity.toUpperCase()}]`.padEnd(10);
          const page = issue.page ? ` (${issue.page})` : "";
          console.log(`${color}${tag}${RESET} ${issue.message}${page}`);
        }

        console.log("");
        if (result.healthy) {
          console.log("Wiki is healthy (warnings only).");
        } else {
          console.log("Wiki has errors that should be addressed.");
          process.exitCode = 1;
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
