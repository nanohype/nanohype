# __ORG_NAME__ — OKR Scoring Rubric

**Project:** __PROJECT_NAME__
**Cadence:** __CADENCE__
**Last updated:** YYYY-MM-DD

---

## Scoring Scale

OKRs are scored on a 0 to 1.0 continuous scale. The score represents the proportion of the key result achieved relative to the target, adjusted for context.

| Score Range | Label | Interpretation |
|---|---|---|
| 0.0 - 0.3 | Failed to make progress | No meaningful progress toward the target. Investigate root cause — was the KR poorly scoped, deprioritized, or blocked? |
| 0.3 - 0.5 | Made progress but fell short | Some progress, but significant gap to target. The work may still have value, but the outcome wasn't achieved. |
| 0.5 - 0.7 | Solid progress | Meaningful progress toward an ambitious target. For stretch goals, this represents real achievement. |
| 0.7 - 0.9 | Strong delivery | Met or nearly met the target. This is the ideal zone for well-calibrated ambitious OKRs. |
| 0.9 - 1.0 | Exceeded expectations | Target fully met or exceeded. If this happens consistently, targets may not be ambitious enough. |

### Healthy Distribution

A well-calibrated OKR program should see scores distributed roughly as:

- **~10%** of KRs score 0.0-0.3 (genuine misses or strategic pivots)
- **~20%** of KRs score 0.3-0.5 (ambitious stretch that fell short)
- **~40%** of KRs score 0.5-0.7 (solid execution on stretch targets)
- **~25%** of KRs score 0.7-0.9 (strong delivery)
- **~5%** of KRs score 0.9-1.0 (exceptional or possibly sandbagged)

If the majority of scores cluster at 0.9-1.0, the organization is likely sandbagging. If the majority cluster below 0.3, targets are unrealistic or execution has systemic issues.

---

## How to Score

### Step 1: Calculate the Raw Score

For quantitative key results with a baseline and target:

```
raw_score = (current_value - baseline) / (target - baseline)
```

**Example:**
- KR: "Reduce onboarding time from 14 days to 5 days"
- Current value at end of cycle: 8 days
- Raw score: (14 - 8) / (14 - 5) = 6 / 9 = 0.67

### Step 2: Apply Context Adjustment

The raw score may need adjustment for factors outside the team's control. Adjustments should be small (±0.1 max) and documented.

| Adjustment Reason | Direction | Example |
|---|---|---|
| External dependency blocked progress | +0.05 to +0.1 | "Auth service migration delayed our integration by 3 weeks" |
| Scope increased mid-cycle | +0.05 to +0.1 | "Target market expanded to include EU, adding compliance work" |
| Favorable tailwind inflated numbers | -0.05 to -0.1 | "Viral social media post drove adoption unrelated to our work" |
| Baseline was incorrect | Recalculate | "Initial baseline of 12% was actually 18% — recalculate from correct starting point" |

### Step 3: Write the Score Narrative

Every scored KR needs a brief narrative (2-4 sentences) explaining:
- What drove the score (positive or negative)
- What the team learned
- Whether the target was well-calibrated

---

## Calibration Examples

### Example 1: Strong Delivery (Score: 0.78)

**Objective:** Accelerate developer onboarding to reduce time-to-productivity

**Key Result:** Reduce time-to-first-deploy for new engineers from 5 days to 1 day

| Attribute | Value |
|---|---|
| Baseline | 5 days |
| Target | 1 day |
| Actual | 2 days |
| Raw score | (5 - 2) / (5 - 1) = 0.75 |
| Adjustment | +0.03 (mid-cycle team reorg caused 2-week disruption) |
| Final score | 0.78 |

**Narrative:** Shipped one-command dev environment setup that brought median onboarding from 5 days to 2 days. The remaining gap is mostly manual config for legacy services that need dedicated migration work. Mid-cycle team reorg cost about two weeks. Target was well-calibrated — 1 day is achievable next cycle with the legacy migration.

### Example 2: Solid Progress on Stretch Target (Score: 0.55)

**Objective:** Establish __ORG_NAME__ as the trusted choice for enterprise customers

**Key Result:** Increase enterprise trial-to-paid conversion from 12% to 20%

| Attribute | Value |
|---|---|
| Baseline | 12% |
| Target | 20% |
| Actual | 16.4% |
| Raw score | (16.4 - 12) / (20 - 12) = 0.55 |
| Adjustment | None |
| Final score | 0.55 |

**Narrative:** Improved conversion from 12% to 16.4% through the dedicated success manager program and streamlined trial experience. The remaining gap appears to be pricing-related — enterprise prospects want annual contracts with volume discounts we don't yet offer. This was a stretch target and 0.55 represents meaningful progress. Recommend carrying forward with a pricing workstream.

### Example 3: Failed to Make Progress (Score: 0.15)

**Objective:** Build a self-serve analytics capability

**Key Result:** 80% of active users create at least one custom report per month

| Attribute | Value |
|---|---|
| Baseline | 15% |
| Target | 80% |
| Actual | 25% |
| Raw score | (25 - 15) / (80 - 15) = 0.15 |
| Adjustment | None |
| Final score | 0.15 |

**Narrative:** Shipped the report builder but adoption stalled at 25%. User research revealed the builder is too complex for non-technical users — the target audience didn't match the implementation. This KR was poorly calibrated: 80% adoption for a new tool in one cycle was unrealistic. Next cycle should focus on simplifying the builder and target 40% adoption as a more honest stretch goal.

### Example 4: Exceeded Expectations (Score: 0.95)

**Objective:** Accelerate developer onboarding

**Key Result:** Developer satisfaction with tooling improves from 3.2 to 4.0 (5-point scale)

| Attribute | Value |
|---|---|
| Baseline | 3.2 |
| Target | 4.0 |
| Actual | 3.95 |
| Raw score | (3.95 - 3.2) / (4.0 - 3.2) = 0.94 |
| Adjustment | None |
| Final score | 0.94 |

**Narrative:** Near-perfect delivery driven by the dev environment improvements and a surprise win from the new CI pipeline that cut build times by 60%. Consider whether 4.0 was ambitious enough — the dev environment work alone may have been sufficient. Next cycle, push to 4.3 and focus on areas developers still rate below 3.5 (documentation, debugging tools).

---

## Objective Scoring

An objective's score is the **average of its key result scores**. Weight all KRs equally unless the team explicitly documented weighted KRs at the start of the cycle.

**Example:**

| Objective | KR1 Score | KR2 Score | KR3 Score | Objective Score |
|---|---|---|---|---|
| Accelerate developer onboarding | 0.78 | 0.55 | 0.94 | 0.76 |

---

## Anti-Patterns in Scoring

| Anti-Pattern | What It Looks Like | Correction |
|---|---|---|
| Grade inflation | Every KR scores 0.9+ | Review targets — they may be too conservative |
| Narrative-free scoring | Numbers without context | Require 2-4 sentence narrative per KR |
| Binary scoring | Everything is 0.0 or 1.0 | Use the full 0-1.0 scale with raw calculations |
| Ignoring context | Penalizing teams for external blockers | Allow small documented adjustments (±0.1 max) |
| Retroactive target changes | Lowering targets at scoring time to improve scores | Targets are locked after alignment review |
| Scoring unstarted KRs as N/A | Avoiding accountability for deprioritized work | Score 0.0 with a narrative explaining why it was deprioritized |
