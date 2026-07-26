import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  afterCommitCount,
  checkScanQuota,
  resolveQuotaConfig,
} from '../lib/quota.ts';
import { monthKeyUtc } from '../lib/cost.ts';
import type { UsageSnapshot } from '../lib/types.ts';
import { InMemoryUsageStore } from '../lib/usage_store.ts';

function snap(committed: number): UsageSnapshot {
  return {
    userId: 'u1',
    monthKey: monthKeyUtc(),
    committedScans: committed,
    spentUsd: 0,
  };
}

Deno.test('free tier allows under 15 committed scans', () => {
  const d = checkScanQuota(snap(14));
  assertEquals(d.allowed, true);
  assertEquals(d.remainingScans, 1);
});

Deno.test('free tier blocks at 15 committed scans', () => {
  const d = checkScanQuota(snap(15));
  assertEquals(d.allowed, false);
  assertEquals(d.reason, 'scan_limit_exceeded');
});

Deno.test('paid tier uses higher limit', () => {
  const d = checkScanQuota(snap(15), resolveQuotaConfig({ isPaid: true }));
  assertEquals(d.allowed, true);
});

Deno.test('InMemoryUsageStore counts only committed toward scan quota', async () => {
  const store = new InMemoryUsageStore();
  await store.createAttempt({
    id: 'a1',
    userId: 'u1',
    householdId: null,
    status: 'parsed',
    estimatedCostUsd: 0.002,
    promptTokens: 100,
    completionTokens: 50,
    model: 'test',
    imageCount: 1,
    locale: 'en-US',
  });
  await store.createAttempt({
    id: 'a2',
    userId: 'u1',
    householdId: null,
    status: 'failed',
    estimatedCostUsd: 0.001,
    promptTokens: 50,
    completionTokens: 10,
    model: 'test',
    imageCount: 1,
    locale: 'en-US',
  });
  let s = await store.getSnapshot('u1');
  assertEquals(s.committedScans, 0);
  // Dollar spend includes failed + parsed
  assertEquals(s.spentUsd > 0, true);

  await store.updateAttempt({ id: 'a1', status: 'committed', committedLineCount: 3 });
  s = await store.getSnapshot('u1');
  assertEquals(s.committedScans, 1);
  assertEquals(afterCommitCount({ ...s, committedScans: 0 }), 1);
});

Deno.test('abandoned parse does not increment committed scans', async () => {
  const store = new InMemoryUsageStore();
  await store.createAttempt({
    id: 'a3',
    userId: 'u1',
    householdId: null,
    status: 'parsed',
    estimatedCostUsd: 0.002,
    promptTokens: 100,
    completionTokens: 50,
    model: 'test',
    imageCount: 1,
    locale: 'en-US',
  });
  await store.updateAttempt({ id: 'a3', status: 'abandoned' });
  const s = await store.getSnapshot('u1');
  assertEquals(s.committedScans, 0);
  // Spend still counted for budget
  assertEquals(s.spentUsd, 0.002);
});
