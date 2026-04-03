// ── Reporter ────────────────────────────────────────────────────────
//
// Generates a markdown report suitable for posting as a GitHub PR
// comment. Includes a summary table with pass/fail status, score
// deltas, and expandable per-suite details.
//

import type { ComparisonResult, SuiteComparison, SuiteScore } from "./types.js";

/**
 * Format a comparison result as a markdown report for a PR comment.
 */
export function formatMarkdownReport(
  comparison: ComparisonResult,
  scores: SuiteScore[],
): string {
  const lines: string[] = [];

  // Header
  const status = comparison.hasRegression ? "REGRESSION DETECTED" : "ALL SUITES PASSING";
  const emoji = comparison.hasRegression ? "X" : "check";
  lines.push(`## Eval Gate: ${status}`);
  lines.push("");

  // Summary table
  lines.push("| Suite | Status | Pass Rate | Score | Delta | Baseline |");
  lines.push("|-------|--------|-----------|-------|-------|----------|");

  for (const suite of comparison.suites) {
    const statusIcon = suite.regressed ? "FAIL" : suite.isNew ? "NEW" : "PASS";
    const delta = formatDelta(suite);
    const baseline = suite.isNew
      ? "—"
      : `${formatPercent(suite.baselineScore ?? 0)}`;

    lines.push(
      `| ${suite.suite} | ${statusIcon} | ${formatPercent(suite.currentPassRate)} | ${formatPercent(suite.currentScore)} | ${delta} | ${baseline} |`,
    );
  }

  lines.push("");

  // Threshold info
  lines.push(
    `**Threshold:** ${formatPercent(comparison.threshold)} max regression allowed`,
  );
  lines.push("");

  // Expandable details per suite
  const scoresMap = new Map(scores.map((s) => [s.suite, s]));

  for (const suite of comparison.suites) {
    const suiteScores = scoresMap.get(suite.suite);
    if (!suiteScores || suiteScores.cases.length === 0) continue;

    lines.push(`<details>`);
    lines.push(`<summary><strong>${suite.suite}</strong> — ${suiteScores.passed}/${suiteScores.total} passed (${formatMs(suiteScores.durationMs)})</summary>`);
    lines.push("");
    lines.push("| Case | Status | Score | Duration |");
    lines.push("|------|--------|-------|----------|");

    for (const c of suiteScores.cases) {
      const caseStatus = c.pass ? "PASS" : "FAIL";
      lines.push(
        `| ${c.name} | ${caseStatus} | ${formatPercent(c.score)} | ${formatMs(c.durationMs)} |`,
      );
    }

    // Show errors if any
    const errors = suiteScores.cases.filter((c) => c.error);
    if (errors.length > 0) {
      lines.push("");
      lines.push("**Errors:**");
      for (const c of errors) {
        lines.push(`- \`${c.name}\`: ${c.error}`);
      }
    }

    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  // Timestamp
  lines.push(`---`);
  lines.push(`*Generated at ${comparison.timestamp}*`);

  return lines.join("\n");
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDelta(suite: SuiteComparison): string {
  if (suite.isNew) return "—";
  const sign = suite.scoreDelta >= 0 ? "+" : "";
  return `${sign}${(suite.scoreDelta * 100).toFixed(1)}%`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
