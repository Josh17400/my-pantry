/**
 * Entitlement + rate limit + budget helpers for chef.
 * Chef is paid-tier only — free users never enter the model path.
 */

import type { QuotaConfig, UsageSnapshot } from './types.ts';
import { DEFAULT_QUOTA_CONFIG } from './types.ts';

export function resolveQuotaConfig(
  overrides: Partial<QuotaConfig> = {},
): QuotaConfig {
  return { ...DEFAULT_QUOTA_CONFIG, ...overrides };
}

export interface EntitlementDecision {
  readonly allowed: boolean;
  readonly reason: 'ok' | 'entitlement_required';
}

/** Paid tier only. Free users get a clear upsell, never a broken model call. */
export function checkEntitlement(isPaid: boolean): EntitlementDecision {
  if (!isPaid) {
    return { allowed: false, reason: 'entitlement_required' };
  }
  return { allowed: true, reason: 'ok' };
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly reason: 'ok' | 'rate_limited';
  readonly requestCount: number;
  readonly limit: number;
  readonly remaining: number;
}

/**
 * Simple per-user request count in the current usage snapshot window.
 * Snapshot is month-scoped for dollars; rate limit uses requestCount that
 * the store maintains for the rate window (or month as an upper bound).
 */
export function checkRateLimit(
  snapshot: UsageSnapshot,
  config: QuotaConfig = DEFAULT_QUOTA_CONFIG,
): RateLimitDecision {
  const limit = config.rateLimitCount;
  const count = snapshot.requestCount;
  if (count >= limit) {
    return {
      allowed: false,
      reason: 'rate_limited',
      requestCount: count,
      limit,
      remaining: 0,
    };
  }
  return {
    allowed: true,
    reason: 'ok',
    requestCount: count,
    limit,
    remaining: limit - count,
  };
}
