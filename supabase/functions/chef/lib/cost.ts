/**
 * Token → dollar cost estimation and monthly budget circuit breaker.
 */

import type {
  ModelPricing,
  QuotaConfig,
  TokenUsage,
  UsageSnapshot,
} from './types.ts';
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

export function roundUsd(n: number): number {
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

export function checkBudget(args: {
  readonly snapshot: UsageSnapshot;
  readonly config: QuotaConfig;
  readonly estimatedAdditionalUsd?: number;
}): BudgetDecision {
  const budgetUsd = args.config.monthlyBudgetUsd;
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

/** Conservative pre-flight estimate for a chef turn. */
export function estimateChefBudgetUsd(args: {
  readonly intent: string;
  readonly pricing?: ModelPricing;
  readonly messageCount?: number;
}): number {
  const pricing = args.pricing ?? DEFAULT_PRICING;
  const msgs = Math.max(1, args.messageCount ?? 1);
  const isRecipe = args.intent === 'generate_recipe';
  const promptTokens = (isRecipe ? 4_000 : 2_500) + msgs * 400;
  const completionTokens = isRecipe ? 2_000 : 900;
  return estimateCostUsd(
    {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    pricing,
  );
}

export function monthKeyUtc(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
