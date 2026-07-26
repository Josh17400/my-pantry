import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  checkEntitlement,
  checkRateLimit,
  resolveQuotaConfig,
} from '../lib/quota.ts';
import { checkBudget } from '../lib/cost.ts';

Deno.test('entitlement: free blocked, paid allowed', () => {
  assertEquals(checkEntitlement(false).allowed, false);
  assertEquals(checkEntitlement(false).reason, 'entitlement_required');
  assertEquals(checkEntitlement(true).allowed, true);
});

Deno.test('rate limit: blocks at ceiling', () => {
  const cfg = resolveQuotaConfig({ rateLimitCount: 3 });
  const ok = checkRateLimit(
    { userId: 'u', monthKey: '2026-07', requestCount: 2, spentUsd: 0 },
    cfg,
  );
  assertEquals(ok.allowed, true);
  assertEquals(ok.remaining, 1);
  const blocked = checkRateLimit(
    { userId: 'u', monthKey: '2026-07', requestCount: 3, spentUsd: 0 },
    cfg,
  );
  assertEquals(blocked.allowed, false);
});

Deno.test('budget: dollar ceiling, not message count', () => {
  const cfg = resolveQuotaConfig({ monthlyBudgetUsd: 1.0, isPaid: true });
  const d = checkBudget({
    snapshot: {
      userId: 'u',
      monthKey: '2026-07',
      requestCount: 100,
      spentUsd: 0.95,
    },
    config: cfg,
    estimatedAdditionalUsd: 0.1,
  });
  assertEquals(d.allowed, false);
  assertEquals(d.reason, 'would_exceed');
});
