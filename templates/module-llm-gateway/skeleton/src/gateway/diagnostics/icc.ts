// ── LinUCB readiness diagnostic (ICC) ───────────────────────────────
//
// Should you upgrade the epsilon-greedy `adaptive` strategy to the
// context-aware `linucb` one? LinUCB only pays off when a provider's reward
// actually depends on the request context — otherwise the contextual model is
// just extra variance over a plain bandit.
//
// This diagnostic answers that empirically from a log of routed requests. It
// buckets requests by context (token quartile × task type × latency budget),
// then for each provider decomposes its reward variance into between-bucket vs
// within-bucket components: ICC = Var_between / (Var_between + Var_within). A
// high ICC means context predicts reward (LinUCB likely helps); a low ICC means
// it doesn't (stay on epsilon-greedy). Run it against ~1000+ logged requests.

import type { RoutingFeatures } from "../routing/types.js";

/** One routed request, as you'd log it for analysis. */
export interface RoutingLogEntry {
  /** The provider the strategy selected (the bandit "arm"). */
  provider: string;
  /** Observed request latency in milliseconds. */
  latencyMs: number;
  /** Whether the request succeeded. */
  success: boolean;
  /** The request's routing features (drives the context buckets). */
  features?: RoutingFeatures;
}

/** Tunables for the diagnostic. Defaults match the issue's calibration. */
export interface IccOptions {
  /** ICC at or above this recommends LinUCB. Default 0.2. */
  switchThreshold?: number;
  /** ICC at or below this recommends staying on epsilon-greedy. Default 0.05. */
  stayThreshold?: number;
  /** Minimum total entries before the result is trusted. Default 1000. */
  minSamples?: number;
  /** Minimum entries a (bucket, arm) cell needs to count. Default 2. */
  minCellSamples?: number;
}

export interface BucketBreakdown {
  bucket: string;
  provider: string;
  count: number;
  meanReward: number;
}

export type IccRecommendation = "switch-to-linucb" | "stay-epsilon-greedy" | "inconclusive";

export interface IccReport {
  /** Sample-weighted ICC across providers (0–1). */
  icc: number;
  recommendation: IccRecommendation;
  reason: string;
  totalSamples: number;
  /** Per-provider ICC, sorted by sample count. */
  perProvider: { provider: string; icc: number; samples: number }[];
  /** Per (bucket, provider) mean reward — the breakdown the report prints. */
  buckets: BucketBreakdown[];
}

/**
 * reward maps a single outcome to a scalar in [0, 1], mirroring the `adaptive`
 * strategy's compositeScore (success 0.7, inverse-latency 0.3) so the diagnostic
 * scores requests the way the live router does.
 */
export function reward(entry: RoutingLogEntry): number {
  const latencyScore = Math.min(1, 100 / (entry.latencyMs || 1000));
  return 0.7 * (entry.success ? 1 : 0) + 0.3 * latencyScore;
}

/** quartileEdges returns the 25/50/75th percentiles of a numeric sample. */
function quartileEdges(values: number[]): [number, number, number] {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return [at(0.25), at(0.5), at(0.75)];
}

/** bucketKey composes the context bucket: token quartile × task type × latency band. */
function bucketKey(
  features: RoutingFeatures | undefined,
  tokenEdges: [number, number, number],
): string {
  const tokens = features?.estimatedTokens;
  let tokenBand = "t?";
  if (tokens !== undefined) {
    tokenBand =
      tokens <= tokenEdges[0]
        ? "t1"
        : tokens <= tokenEdges[1]
          ? "t2"
          : tokens <= tokenEdges[2]
            ? "t3"
            : "t4";
  }
  const task = features?.taskType ?? "unknown";
  const budget = features?.latencyBudgetMs;
  const latBand =
    budget === undefined ? "l?" : budget <= 2000 ? "tight" : budget <= 8000 ? "normal" : "lax";
  return `${tokenBand}|${task}|${latBand}`;
}

/**
 * oneWayIcc decomposes a set of (group, value) observations into between-group
 * and within-group variance and returns ICC = Vb / (Vb + Vw) = Vb / Vtotal.
 * Returns null when there isn't enough structure to estimate it (fewer than two
 * groups with data).
 */
function oneWayIcc(groups: number[][]): number | null {
  const usable = groups.filter((g) => g.length > 0);
  if (usable.length < 2) return null;
  const all = usable.flat();
  const n = all.length;
  const grandMean = all.reduce((s, x) => s + x, 0) / n;

  let vb = 0; // between-group
  let vw = 0; // within-group
  for (const g of usable) {
    const mean = g.reduce((s, x) => s + x, 0) / g.length;
    vb += g.length * (mean - grandMean) ** 2;
    for (const x of g) vw += (x - mean) ** 2;
  }
  vb /= n;
  vw /= n;
  const total = vb + vw;
  if (total === 0) return 0; // no variance at all → context explains nothing
  return vb / total;
}

/**
 * computeIcc runs the readiness diagnostic over a request log and returns a
 * report with the aggregate ICC, a recommendation, and the per-bucket breakdown.
 */
export function computeIcc(log: RoutingLogEntry[], options: IccOptions = {}): IccReport {
  const switchThreshold = options.switchThreshold ?? 0.2;
  const stayThreshold = options.stayThreshold ?? 0.05;
  const minSamples = options.minSamples ?? 1000;
  const minCellSamples = options.minCellSamples ?? 2;

  const tokenValues = log
    .map((e) => e.features?.estimatedTokens)
    .filter((t): t is number => t !== undefined);
  const tokenEdges =
    tokenValues.length > 0 ? quartileEdges(tokenValues) : ([0, 0, 0] as [number, number, number]);

  // provider → bucket → rewards
  const byProvider = new Map<string, Map<string, number[]>>();
  for (const entry of log) {
    const key = bucketKey(entry.features, tokenEdges);
    let buckets = byProvider.get(entry.provider);
    if (!buckets) {
      buckets = new Map();
      byProvider.set(entry.provider, buckets);
    }
    const rewards = buckets.get(key) ?? [];
    rewards.push(reward(entry));
    buckets.set(key, rewards);
  }

  const perProvider: { provider: string; icc: number; samples: number }[] = [];
  const breakdown: BucketBreakdown[] = [];
  let weightedSum = 0;
  let weightTotal = 0;

  for (const [provider, buckets] of byProvider) {
    const cells = [...buckets.entries()].filter(([, r]) => r.length >= minCellSamples);
    let providerSamples = 0;
    for (const [bucket, rewards] of cells) {
      providerSamples += rewards.length;
      breakdown.push({
        bucket,
        provider,
        count: rewards.length,
        meanReward: rewards.reduce((s, x) => s + x, 0) / rewards.length,
      });
    }
    const icc = oneWayIcc(cells.map(([, r]) => r));
    if (icc !== null && providerSamples > 0) {
      perProvider.push({ provider, icc, samples: providerSamples });
      weightedSum += icc * providerSamples;
      weightTotal += providerSamples;
    }
  }

  perProvider.sort((a, b) => b.samples - a.samples);
  breakdown.sort(
    (a, b) => a.bucket.localeCompare(b.bucket) || a.provider.localeCompare(b.provider),
  );

  const icc = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const totalSamples = log.length;

  let recommendation: IccRecommendation;
  let reason: string;
  if (totalSamples < minSamples || weightTotal === 0) {
    recommendation = "inconclusive";
    reason = `Only ${totalSamples} logged requests across ${perProvider.length} provider(s) with enough per-bucket data; collect ≥${minSamples} before trusting the ICC.`;
  } else if (icc >= switchThreshold) {
    recommendation = "switch-to-linucb";
    reason = `ICC ${icc.toFixed(3)} ≥ ${switchThreshold}: context explains a meaningful share of reward variance — a contextual bandit (linucb) should beat epsilon-greedy.`;
  } else if (icc <= stayThreshold) {
    recommendation = "stay-epsilon-greedy";
    reason = `ICC ${icc.toFixed(3)} ≤ ${stayThreshold}: context barely moves reward — the adaptive (epsilon-greedy) strategy is sufficient.`;
  } else {
    recommendation = "inconclusive";
    reason = `ICC ${icc.toFixed(3)} is between ${stayThreshold} and ${switchThreshold}: collect more data, or A/B both strategies.`;
  }

  return { icc, recommendation, reason, totalSamples, perProvider, buckets: breakdown };
}

/** renderIccMarkdown formats a report for a human (or a CI comment). */
export function renderIccMarkdown(report: IccReport): string {
  const lines = [
    "# LinUCB readiness (ICC)",
    "",
    `- **ICC:** ${report.icc.toFixed(3)}`,
    `- **Recommendation:** \`${report.recommendation}\``,
    `- **Samples:** ${report.totalSamples}`,
    "",
    report.reason,
    "",
    "## Per provider",
    "",
    "| Provider | ICC | Samples |",
    "|----------|-----|---------|",
    ...report.perProvider.map((p) => `| ${p.provider} | ${p.icc.toFixed(3)} | ${p.samples} |`),
    "",
    "## Bucket × provider mean reward",
    "",
    "| Bucket (tokens·task·latency) | Provider | n | Mean reward |",
    "|------------------------------|----------|---|-------------|",
    ...report.buckets.map(
      (b) => `| ${b.bucket} | ${b.provider} | ${b.count} | ${b.meanReward.toFixed(3)} |`,
    ),
  ];
  return lines.join("\n");
}
