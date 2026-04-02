import type { SuiteResult, CaseResult } from "../suite.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

/**
 * Terminal reporter that outputs color-coded eval results to the console.
 * Shows pass/fail per case, assertion details, suite summaries, and an
 * overall summary across all suites.
 */
export class ConsoleReporter {
  report(results: SuiteResult[]): void {
    let totalCases = 0;
    let totalPassed = 0;
    let totalDurationMs = 0;

    for (const suite of results) {
      this.reportSuite(suite);
      totalCases += suite.cases.length;
      totalPassed += suite.cases.filter((c) => c.pass).length;
      totalDurationMs += suite.durationMs;
    }

    // Overall summary
    console.log("");
    console.log(`${BOLD}═══ Overall Summary ═══${RESET}`);
    console.log(
      `Suites: ${results.length}  |  Cases: ${totalPassed}/${totalCases} passed  |  Duration: ${this.formatDuration(totalDurationMs)}`,
    );

    const allPassed = totalPassed === totalCases;
    if (allPassed) {
      console.log(`${GREEN}${BOLD}All evaluations passed.${RESET}`);
    } else {
      console.log(
        `${RED}${BOLD}${totalCases - totalPassed} evaluation(s) failed.${RESET}`,
      );
    }
    console.log("");
  }

  private reportSuite(suite: SuiteResult): void {
    console.log("");
    console.log(`${BOLD}─── Suite: ${suite.name} ───${RESET}`);
    if (suite.description) {
      console.log(`${DIM}${suite.description}${RESET}`);
    }
    console.log("");

    for (const caseResult of suite.cases) {
      this.reportCase(caseResult);
    }

    // Suite summary
    const passRate = (suite.passRate * 100).toFixed(1);
    const avgScore = (suite.averageScore * 100).toFixed(1);
    const color = suite.passRate === 1 ? GREEN : suite.passRate > 0.5 ? YELLOW : RED;
    console.log(
      `  ${color}Pass rate: ${passRate}%  |  Avg score: ${avgScore}%  |  Duration: ${this.formatDuration(suite.durationMs)}${RESET}`,
    );
  }

  private reportCase(result: CaseResult): void {
    const icon = result.pass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    const duration = `${DIM}(${this.formatDuration(result.durationMs)})${RESET}`;
    console.log(`  ${icon}  ${result.name}  ${duration}`);

    if (result.error) {
      console.log(`    ${RED}Error: ${result.error}${RESET}`);
      return;
    }

    for (const assertion of result.assertions) {
      const aIcon = assertion.pass ? `${GREEN}+${RESET}` : `${RED}-${RESET}`;
      console.log(`    ${aIcon} ${assertion.message}`);
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }
}
