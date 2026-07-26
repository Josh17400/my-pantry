/**
 * Token → dollar cost estimation and monthly budget circuit breaker.
 * Pure functions — no I/O.
 */

import type { ModelPricing, QuotaConfig, TokenUsage, UsageSnapshot } from './types.ts';
import { DEFAULT_PRICING } from './types.ts';

export function estimateCostUsd(
  usage: TokenUsage,
  pricing: ModelPricing = DEFAULT_PRICING,
): number {
  const prompt =
    (usage.promptTokens / 1_000_000) * pricing.promptPerMillionUsd;
  const completion =
    (usage.completionTokens / 1_000_000) * pricing.completionPerMillionUsd;
  return roundUsd(prompt + completion);
}

export function sumCosts(...costs: readonly number[]): number {
  return roundUsd(costs.reduce((a, b) => a + b, 0));
}

export function roundUsd(n: number): number {
  // Micro-dollar precision is enough for circuit breakers.
  return Math.round(n * 1_000_000) / 1_000_000;
}

export interface BudgetDecision {
  readonly allowed: boolean;
  readonly reason: 'ok' | 'budget_exceeded' | 'would_exceed';
  readonly spentUsd: number;
  readonly budgetUsd: number;
  readonly remainingUsd: number;
  readonly projectedSpendUsd: number;
}

/**
 * Circuit breaker: reject when current spend OR projected spend (current + estimate)
 * would exceed the configured monthly dollar ceiling.
 *
 * Uses p95-aware ceilings via QuotaConfig — scan counters alone do not bound cost
 * (red-team M6).
 */
export function checkBudget(args: {
  readonly snapshot: UsageSnapshot;
  readonly config: QuotaConfig;
  /** Estimated cost of the upcoming call(s); 0 to only check current spend. */
  readonly estimatedAdditionalUsd?: number;
}): BudgetDecision {
  const budgetUsd = args.config.isPaid
    ? args.config.paidMonthlyBudgetUsd
    : args.config.monthlyBudgetUsd;
  const spentUsd = roundUsd(args.snapshot.spentUsd);
  const additional = roundUsd(args.estimatedAdditionalUsd ?? 0);
  const projected = roundUsd(spentUsd + additional);
  const remaining = roundUsd(Math.max(0, budgetUsd - spentUsd));

  if (spentUsd >= budgetUsd) {
    return {
      allowed: false,
      reason: 'budget_exceeded',
      spentUsd,
      budgetUsd,
      remainingUsd: 0,
      projectedSpendUsd: projected,
    };
  }
  if (projected > budgetUsd) {
    return {
      allowed: false,
      reason: 'would_exceed',
      spentUsd,
      budgetUsd,
      remainingUsd: remaining,
      projectedSpendUsd: projected,
    };
  }
  return {
    allowed: true,
    reason: 'ok',
    spentUsd,
    budgetUsd,
    remainingUsd: remaining,
    projectedSpendUsd: projected,
  };
}

/**
 * Pre-flight cost estimate before calling the model.
 * Image tiling is model-specific; we use a conservative Flash-class heuristic
 * so the breaker trips before a 40-line multi-photo warehouse receipt blows the budget.
 */
export function estimateParseBudgetUsd(args: {
  readonly imageCount: number;
  readonly pricing?: ModelPricing;
  /** Include grocery gate call. */
  readonly includeGate?: boolean;
}): number {
  const pricing = args.pricing ?? DEFAULT_PRICING;
  const images = Math.max(1, args.imageCount);
  // ~2k image tokens + 800 prompt per photo; warehouse JSON out ~2.5k tokens base + 80/line × ~40
  const promptTokens = images * 2_800 + 600;
  const completionTokens = 400 + images * 1_200;
  const parseCost = estimateCostUsd(
    { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    pricing,
  );
  if (args.includeGate === false) return parseCost;
  const gatePrompt = 900 + images * 400;
  const gateCompletion = 80;
  const gateCost = estimateCostUsd(
    {
      promptTokens: gatePrompt,
      completionTokens: gateCompletion,
      totalTokens: gatePrompt + gateCompletion,
    },
    pricing,
  );
  return sumCosts(gateCost, parseCost);
}

export function monthKeyUtc(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
