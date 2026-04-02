import { writeFileSync } from "node:fs";
import type { SuiteResult } from "../suite.js";

/**
 * Structured JSON output for a complete eval run.
 */
interface JsonReport {
  timestamp: string;
  suites: SuiteResult[];
  summary: {
    totalSuites: number;
    totalCases: number;
    totalPassed: number;
    passRate: number;
    averageScore: number;
    durationMs: number;
  };
}

/**
 * JSON reporter that outputs structured eval results for CI consumption.
 * Writes to stdout by default, or to a file if an output path is provided.
 */
export class JsonReporter {
  private outputFile?: string;

  constructor(outputFile?: string) {
    this.outputFile = outputFile;
  }

  report(results: SuiteResult[]): void {
    const totalCases = results.reduce((sum, s) => sum + s.cases.length, 0);
    const totalPassed = results.reduce(
      (sum, s) => sum + s.cases.filter((c) => c.pass).length,
      0,
    );
    const totalScore = results.reduce(
      (sum, s) => sum + s.cases.reduce((cs, c) => cs + c.score, 0),
      0,
    );
    const totalDurationMs = results.reduce((sum, s) => sum + s.durationMs, 0);

    const report: JsonReport = {
      timestamp: new Date().toISOString(),
      suites: results,
      summary: {
        totalSuites: results.length,
        totalCases,
        totalPassed,
        passRate: totalCases > 0 ? totalPassed / totalCases : 1,
        averageScore: totalCases > 0 ? totalScore / totalCases : 1,
        durationMs: totalDurationMs,
      },
    };

    const json = JSON.stringify(report, null, 2);

    if (this.outputFile) {
      writeFileSync(this.outputFile, json, "utf-8");
    } else {
      console.log(json);
    }
  }
}
