// ── Baseline ────────────────────────────────────────────────────────
//
// Load, save, and compare eval baselines. The baseline file is a JSON
// array of per-suite scores stored at a known path (default:
// .eval-baseline.json). Comparison checks whether any suite's score
// dropped by more than the configured regression threshold.
//

import { readFile, writeFile } from "node:fs/promises";
import type {
  BaselineEntry,
  ComparisonResult,
  SuiteComparison,
  SuiteScore,
} from "./types.js";

/**
 * Load baseline entries from a JSON file. Returns an empty array if
 * the file does not exist or contains an empty array.
 */
export async function loadBaseline(path: string): Promise<BaselineEntry[]> {
  try {
    const content = await readFile(path, "utf-8");
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed as BaselineEntry[];
  } catch {
    return [];
  }
}

/**
 * Save current suite scores as the new baseline.
 */
export async function saveBaseline(
  path: string,
  scores: SuiteScore[],
): Promise<void> {
  const now = new Date().toISOString();
  const entries: BaselineEntry[] = scores.map((s) => ({
    suite: s.suite,
    passRate: s.passRate,
    averageScore: s.averageScore,
    updatedAt: now,
  }));
  await writeFile(path, JSON.stringify(entries, null, 2) + "\n", "utf-8");
}

/**
 * Compare current suite scores against stored baseline entries.
 * A suite is flagged as regressed if its average score dropped by
 * more than `threshold` compared to the baseline.
 */
export function compareBaseline(
  current: SuiteScore[],
  stored: BaselineEntry[],
  threshold: number,
): ComparisonResult {
  const baselineMap = new Map(stored.map((e) => [e.suite, e]));

  const suites: SuiteComparison[] = current.map((suite) => {
    const baseline = baselineMap.get(suite.suite);

    if (!baseline) {
      return {
        suite: suite.suite,
        currentPassRate: suite.passRate,
        currentScore: suite.averageScore,
        baselinePassRate: null,
        baselineScore: null,
        scoreDelta: 0,
        regressed: false,
        isNew: true,
      };
    }

    const scoreDelta = suite.averageScore - baseline.averageScore;
    const regressed = scoreDelta < -threshold;

    return {
      suite: suite.suite,
      currentPassRate: suite.passRate,
      currentScore: suite.averageScore,
      baselinePassRate: baseline.passRate,
      baselineScore: baseline.averageScore,
      scoreDelta,
      regressed,
      isNew: false,
    };
  });

  return {
    suites,
    hasRegression: suites.some((s) => s.regressed),
    threshold,
    timestamp: new Date().toISOString(),
  };
}
