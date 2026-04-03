// ── Types ───────────────────────────────────────────────────────────
//
// Shared type definitions for the eval-gated CI pipeline. All data
// structures are plain objects — no class instances — so they
// serialize cleanly to JSON for baseline storage and PR comments.
//

/**
 * Result of running a single eval case within a suite.
 */
export interface EvalResult {
  /** Case identifier */
  name: string;
  /** Whether every assertion passed */
  pass: boolean;
  /** Aggregate score (0.0–1.0) across all assertions */
  score: number;
  /** LLM output text */
  output: string;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Error message if the case failed due to an exception */
  error?: string;
}

/**
 * Aggregate scores for a single eval suite.
 */
export interface SuiteScore {
  /** Suite name (derived from YAML filename or suite `name` field) */
  suite: string;
  /** Number of cases that passed */
  passed: number;
  /** Total number of cases */
  total: number;
  /** Pass rate (0.0–1.0) */
  passRate: number;
  /** Average score across all cases (0.0–1.0) */
  averageScore: number;
  /** Total execution time in milliseconds */
  durationMs: number;
  /** Individual case results */
  cases: EvalResult[];
}

/**
 * A single entry in the baseline file, representing the stored
 * score for one suite.
 */
export interface BaselineEntry {
  /** Suite name */
  suite: string;
  /** Stored pass rate at time of baseline capture */
  passRate: number;
  /** Stored average score at time of baseline capture */
  averageScore: number;
  /** ISO 8601 timestamp when the baseline was recorded */
  updatedAt: string;
}

/**
 * Result of comparing a single suite's current scores against its
 * stored baseline entry.
 */
export interface SuiteComparison {
  /** Suite name */
  suite: string;
  /** Current pass rate */
  currentPassRate: number;
  /** Current average score */
  currentScore: number;
  /** Baseline pass rate (null if no baseline exists for this suite) */
  baselinePassRate: number | null;
  /** Baseline average score (null if no baseline exists) */
  baselineScore: number | null;
  /** Score delta: current - baseline (positive = improvement) */
  scoreDelta: number;
  /** Whether the suite regressed beyond the threshold */
  regressed: boolean;
  /** Whether this is a new suite with no baseline */
  isNew: boolean;
}

/**
 * Full comparison result across all suites.
 */
export interface ComparisonResult {
  /** Per-suite comparison details */
  suites: SuiteComparison[];
  /** Whether any suite regressed beyond the threshold */
  hasRegression: boolean;
  /** The threshold that was used for comparison */
  threshold: number;
  /** ISO 8601 timestamp of the comparison */
  timestamp: string;
}
