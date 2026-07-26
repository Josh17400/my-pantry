/**
 * Scan-quota accounting.
 *
 * Charge on COMMIT, not on parse (SPEC M2):
 * - parse records an attempt and may spend dollars (budget breaker)
 * - only commit increments committedScans toward the free-tier limit
 * - failed OCR / abandoned review / non-grocery pre-check do NOT burn a scan
 *
 * Dollar budget is separate (see cost.ts) and counts all model spend.
 */

import type { QuotaConfig, UsageSnapshot } from './types.ts';
import { DEFAULT_QUOTA_CONFIG } from './types.ts';

export interface ScanQuotaDecision {
  readonly allowed: boolean;
  readonly reason: 'ok' | 'scan_limit_exceeded';
  readonly committedScans: number;
  readonly scanLimit: number;
  readonly remainingScans: number;
}

export function scanLimitFor(config: QuotaConfig): number {
  return config.isPaid ? config.paidScanLimit : config.freeScanLimit;
}

/**
 * May the user start a new parse (and later commit)?
 * Checked before any paid model call.
 */
export function checkScanQuota(
  snapshot: UsageSnapshot,
  config: QuotaConfig = DEFAULT_QUOTA_CONFIG,
): ScanQuotaDecision {
  const scanLimit = scanLimitFor(config);
  const committed = snapshot.committedScans;
  if (committed >= scanLimit) {
    return {
      allowed: false,
      reason: 'scan_limit_exceeded',
      committedScans: committed,
      scanLimit,
      remainingScans: 0,
    };
  }
  return {
    allowed: true,
    reason: 'ok',
    committedScans: committed,
    scanLimit,
    remainingScans: scanLimit - committed,
  };
}

/**
 * After a successful commit, the new committed count.
 * Pure helper for tests / response shaping.
 */
export function afterCommitCount(snapshot: UsageSnapshot): number {
  return snapshot.committedScans + 1;
}

export function resolveQuotaConfig(
  overrides: Partial<QuotaConfig> = {},
): QuotaConfig {
  return { ...DEFAULT_QUOTA_CONFIG, ...overrides };
}
