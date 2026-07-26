/**
 * Pure entitlement helpers.
 * Server gates (chef, receipt quota) always re-check app_metadata — never
 * accept a client "I am paid" claim without a webhook-mirrored plan.
 */

import {
  ENTITLEMENT_ID_PRO,
  type EntitlementSnapshot,
  type EntitlementTier,
  FREE_RECEIPT_SCANS_PER_MONTH,
  PAID_PLANS,
  type PaywallFeature,
  type PlanId,
} from './types';

export function isPaidPlan(plan: string | null | undefined): boolean {
  if (!plan) return false;
  return PAID_PLANS.has(plan);
}

export function planToTier(plan: string | null | undefined): EntitlementTier {
  return isPaidPlan(plan) ? 'paid' : 'free';
}

export function normalizePlan(plan: string | null | undefined): PlanId {
  if (plan === 'pro' || plan === 'unlimited' || plan === 'paid') return plan;
  return 'free';
}

/**
 * Resolve tier from session metadata (same keys chef + parse-receipt use).
 */
export function tierFromSessionMetadata(
  appMetadata: Record<string, unknown> | null | undefined,
  userMetadata: Record<string, unknown> | null | undefined,
): EntitlementTier {
  const plan =
    (appMetadata?.plan as string | undefined) ??
    (userMetadata?.plan as string | undefined);
  return planToTier(plan);
}

/**
 * RevenueCat CustomerInfo-shaped check (defensive — RC shapes vary by SDK).
 */
export function tierFromRevenueCatCustomerInfo(
  customerInfo: unknown,
): EntitlementTier {
  if (!customerInfo || typeof customerInfo !== 'object') return 'free';
  const info = customerInfo as {
    entitlements?: {
      active?: Record<string, unknown>;
      all?: Record<string, { isActive?: boolean }>;
    };
  };
  const active = info.entitlements?.active;
  if (active && typeof active === 'object') {
    if (ENTITLEMENT_ID_PRO in active) return 'paid';
    if (Object.keys(active).length > 0) {
      // Any active entitlement maps to paid for this product.
      return 'paid';
    }
  }
  const all = info.entitlements?.all;
  if (all && typeof all === 'object') {
    for (const [id, ent] of Object.entries(all)) {
      if (ent?.isActive && (id === ENTITLEMENT_ID_PRO || id.length > 0)) {
        return 'paid';
      }
    }
  }
  return 'free';
}

export function freeSnapshot(
  source: EntitlementSnapshot['source'] = 'default',
): EntitlementSnapshot {
  return {
    tier: 'free',
    plan: 'free',
    source,
    refreshedAt: null,
    activeEntitlementId: null,
  };
}

export function paidSnapshot(
  source: EntitlementSnapshot['source'],
  plan: PlanId = 'paid',
  entitlementId: string | null = ENTITLEMENT_ID_PRO,
): EntitlementSnapshot {
  return {
    tier: 'paid',
    plan: isPaidPlan(plan) ? plan : 'paid',
    source,
    refreshedAt: new Date().toISOString(),
    activeEntitlementId: entitlementId,
  };
}

/** Free-tier scan remaining helper (client display only). */
export function remainingFreeScans(committedThisMonth: number): number {
  return Math.max(0, FREE_RECEIPT_SCANS_PER_MONTH - committedThisMonth);
}

/**
 * Honest paywall matrix — free is a real pantry app.
 * Paid sells AI chef, unlimited scans, no ads, household, cost analytics.
 */
export const PAYWALL_FEATURES: readonly PaywallFeature[] = [
  {
    id: 'pantry',
    label: 'Unlimited pantry, recipes, and lists',
    free: true,
    paid: true,
  },
  {
    id: 'cook',
    label: 'Cook-to-deduct, low/out, quick items',
    free: true,
    paid: true,
  },
  {
    id: 'community',
    label: 'Community browsing',
    free: true,
    paid: true,
  },
  {
    id: 'scans',
    label: `${FREE_RECEIPT_SCANS_PER_MONTH} receipt scans / month`,
    free: true,
    paid: false,
  },
  {
    id: 'scans_unlimited',
    label: 'Unlimited receipt scans',
    free: false,
    paid: true,
  },
  {
    id: 'chef',
    label: 'AI chef (pantry-grounded, allergen-safe)',
    free: false,
    paid: true,
  },
  {
    id: 'no_ads',
    label: 'No ads',
    free: false,
    paid: true,
  },
  {
    id: 'household',
    label: 'Household sharing',
    free: false,
    paid: true,
  },
  {
    id: 'cost',
    label: 'Cost analytics & meal planner',
    free: false,
    paid: true,
  },
] as const;

/** Whether an in-feed ad may render. Pure — used by AdSlot + tests. */
export function shouldShowAd(args: {
  readonly paidTier?: boolean;
  readonly isPaid: boolean;
  readonly forceShow?: boolean;
}): boolean {
  if (args.forceShow) return true;
  if (args.paidTier === true) return false;
  if (args.isPaid) return false;
  return true;
}

/**
 * Cooking mode must never host ads (product + AdMob policy).
 * Source-level absence is enforced separately; this is the runtime guard.
 */
export function adsAllowedOnRoute(pathname: string): boolean {
  if (pathname.includes('/cooking')) return false;
  return true;
}
