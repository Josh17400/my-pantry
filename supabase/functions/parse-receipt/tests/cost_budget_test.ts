import {
  assertEquals,
  assertAlmostEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  checkBudget,
  estimateCostUsd,
  estimateParseBudgetUsd,
  monthKeyUtc,
  sumCosts,
} from '../lib/cost.ts';
import { DEFAULT_PRICING, DEFAULT_QUOTA_CONFIG } from '../lib/types.ts';
import type { UsageSnapshot } from '../lib/types.ts';

function snap(spent: number, committed = 0): UsageSnapshot {
  return {
    userId: 'u1',
    monthKey: monthKeyUtc(),
    committedScans: committed,
    spentUsd: spent,
  };
}

Deno.test('estimateCostUsd uses per-million pricing', () => {
  const cost = estimateCostUsd(
    { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 },
    DEFAULT_PRICING,
  );
  // 0.30 + 2.50 = 2.80
  assertAlmostEquals(cost, 2.8, 1e-9);
});

Deno.test('estimateParseBudgetUsd grows with image count', () => {
  const one = estimateParseBudgetUsd({ imageCount: 1 });
  const multi = estimateParseBudgetUsd({ imageCount: 4 });
  assertEquals(multi > one, true);
  // Still small for Flash-class (cents scale for single, under a few cents multi)
  assertEquals(one < 0.05, true);
});

Deno.test('budget breaker trips at configured ceiling when already spent', () => {
  const config = {
    ...DEFAULT_QUOTA_CONFIG,
    monthlyBudgetUsd: 0.5,
    isPaid: false,
  };
  const decision = checkBudget({
    snapshot: snap(0.5),
    config,
    estimatedAdditionalUsd: 0.001,
  });
  assertEquals(decision.allowed, false);
  assertEquals(decision.reason, 'budget_exceeded');
  assertEquals(decision.remainingUsd, 0);
});

Deno.test('budget breaker trips when projected spend would exceed', () => {
  const config = {
    ...DEFAULT_QUOTA_CONFIG,
    monthlyBudgetUsd: 0.1,
    isPaid: false,
  };
  const decision = checkBudget({
    snapshot: snap(0.08),
    config,
    estimatedAdditionalUsd: 0.05,
  });
  assertEquals(decision.allowed, false);
  assertEquals(decision.reason, 'would_exceed');
  assertAlmostEquals(decision.projectedSpendUsd, 0.13, 1e-9);
});

Deno.test('budget allows when under ceiling', () => {
  const decision = checkBudget({
    snapshot: snap(0.01),
    config: DEFAULT_QUOTA_CONFIG,
    estimatedAdditionalUsd: 0.01,
  });
  assertEquals(decision.allowed, true);
  assertEquals(decision.reason, 'ok');
});

Deno.test('paid tier uses higher budget ceiling', () => {
  const config = {
    ...DEFAULT_QUOTA_CONFIG,
    isPaid: true,
    paidMonthlyBudgetUsd: 5,
    monthlyBudgetUsd: 0.5,
  };
  const decision = checkBudget({
    snapshot: snap(0.6),
    config,
    estimatedAdditionalUsd: 0.1,
  });
  assertEquals(decision.allowed, true);
});

Deno.test('warehouse multi-photo p95 estimate can exhaust small free budget', () => {
  // Simulate a free user who already spent most of $0.50, then tries 6-photo warehouse.
  const remaining = 0.02;
  const spent = 0.5 - remaining;
  const projected = estimateParseBudgetUsd({ imageCount: 6, includeGate: true });
  const decision = checkBudget({
    snapshot: snap(spent),
    config: { ...DEFAULT_QUOTA_CONFIG, monthlyBudgetUsd: 0.5 },
    estimatedAdditionalUsd: projected,
  });
  // Either trips or leaves tiny remaining — at least documents cost scale.
  assertEquals(typeof projected, 'number');
  assertEquals(projected > 0, true);
  // With spent near ceiling, multi-photo should trip.
  assertEquals(decision.allowed, false);
});

Deno.test('sumCosts rounds stably', () => {
  assertEquals(sumCosts(0.0001, 0.0002, 0.0003), 0.0006);
});
