import type { GatewayProvider } from "../providers/types.js";
import type { RoutingStrategy, RoutingContext } from "./types.js";
import { registerStrategy } from "./registry.js";

// ── LinUCB Contextual Bandit Routing Strategy ───────────────────────
//
// Per-provider ridge regression predicts expected reward given request
// features. On each request, selects the provider with the highest
// upper confidence bound (UCB):
//
//   score = θ·x + α · √(x·A⁻¹·x)
//
// where θ = A⁻¹·b. After observing the outcome, the model is updated
// via Sherman-Morrison incremental rank-1 updates to A⁻¹, avoiding
// full matrix inversion on the hot path.
//
// Reference: Li et al. 2010, "A Contextual-Bandit Approach to
// Personalized News Article Recommendation" (arXiv:1003.0146).
//

const DEFAULT_ALPHA = 1.0;
const FEATURE_DIM = 6;
const MIN_SAMPLES = 5;

// ── Flat-array linear algebra (d < 10) ──────────────────────────────

function identity(d: number): number[] {
  const m = new Array(d * d).fill(0);
  for (let i = 0; i < d; i++) m[i * d + i] = 1;
  return m;
}

function matVecMul(m: number[], v: number[], d: number): number[] {
  const out = new Array(d).fill(0);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      out[i] += m[i * d + j] * v[j];
    }
  }
  return out;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Sherman-Morrison: (A⁻¹ + x·xᵀ)⁻¹ = A⁻¹ − (A⁻¹·x·xᵀ·A⁻¹)/(1+xᵀ·A⁻¹·x) */
function shermanMorrisonUpdate(ainv: number[], x: number[], d: number): void {
  const ainvX = matVecMul(ainv, x, d);
  const denom = 1 + dot(x, ainvX);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      ainv[i * d + j] -= (ainvX[i] * ainvX[j]) / denom;
    }
  }
}

// ── Feature extraction ──────────────────────────────────────────────

const TASK_TYPES = ["chat", "reasoning", "code", "embedding"] as const;

function buildFeatureVector(ctx: RoutingContext): number[] {
  const f = ctx.features;
  const estimatedTokens = f?.estimatedTokens ?? Math.ceil(ctx.prompt.length / 4);
  const latencyBudget = f?.latencyBudgetMs ?? 5000;

  const x = new Array(FEATURE_DIM).fill(0);
  x[0] = 1; // bias
  x[1] = Math.min(estimatedTokens / 1000, 5); // normalized tokens

  const taskIndex = f?.taskType ? TASK_TYPES.indexOf(f.taskType) : -1;
  if (taskIndex >= 0) {
    x[2 + taskIndex] = 1; // one-hot task type (indices 2–5)
  }

  // Scale by latency budget and quality to influence magnitude
  const latencyScale = Math.min(latencyBudget / 5000, 2);
  const quality = f?.qualityRequired ?? 0.5;
  x[1] *= latencyScale;
  x[0] *= 0.5 + quality;

  return x;
}

// ── Provider arm state ──────────────────────────────────────────────

interface ArmState {
  ainv: number[]; // d×d inverse covariance
  b: number[];    // d×1 reward-weighted features
  samples: number;
}

// ── Factory ─────────────────────────────────────────────────────────

export function createLinucbStrategy(alpha = DEFAULT_ALPHA): RoutingStrategy {
  const d = FEATURE_DIM;
  const arms = new Map<string, ArmState>();
  // Cache the feature vector from the most recent select() per provider
  // so recordOutcome() can use the actual request context for its update.
  const lastFeatures = new Map<string, number[]>();

  function getArm(name: string): ArmState {
    let arm = arms.get(name);
    if (!arm) {
      arm = { ainv: identity(d), b: new Array(d).fill(0), samples: 0 };
      arms.set(name, arm);
    }
    return arm;
  }

  function totalSamples(): number {
    let total = 0;
    for (const arm of arms.values()) total += arm.samples;
    return total;
  }

  function ucbScore(arm: ArmState, x: number[]): number {
    const theta = matVecMul(arm.ainv, arm.b, d);
    const exploitation = dot(theta, x);
    const ainvX = matVecMul(arm.ainv, x, d);
    const exploration = alpha * Math.sqrt(Math.max(0, dot(x, ainvX)));
    return exploitation + exploration;
  }

  return {
    name: "linucb",

    select(providers: GatewayProvider[], context: RoutingContext): GatewayProvider {
      if (providers.length === 0) {
        throw new Error("No providers available for routing");
      }

      // Fall back to first provider when insufficient data
      if (totalSamples() < MIN_SAMPLES) {
        return providers[0];
      }

      const x = buildFeatureVector(context);

      let bestProvider = providers[0];
      let bestScore = -Infinity;

      for (const provider of providers) {
        const arm = getArm(provider.name);
        const score = ucbScore(arm, x);
        if (score > bestScore) {
          bestScore = score;
          bestProvider = provider;
        }
      }

      // Cache feature vector so recordOutcome can use actual context
      lastFeatures.set(bestProvider.name, x);

      return bestProvider;
    },

    recordOutcome(provider: string, latencyMs: number, success: boolean): void {
      const arm = getArm(provider);

      // Reward: success weighted by inverse latency (fast success = high reward)
      const reward = success ? Math.min(1, 100 / (latencyMs || 100)) : 0;

      // Use the cached feature vector from select() when available,
      // otherwise fall back to a bias-only vector for global signal.
      const x = lastFeatures.get(provider) ?? (() => {
        const fallback = new Array(d).fill(0);
        fallback[0] = 1;
        return fallback;
      })();
      lastFeatures.delete(provider);

      // Sherman-Morrison rank-1 update to A⁻¹
      shermanMorrisonUpdate(arm.ainv, x, d);

      // Update reward vector
      for (let i = 0; i < d; i++) arm.b[i] += reward * x[i];

      arm.samples++;
    },
  };
}

// Self-register
registerStrategy("linucb", createLinucbStrategy);
