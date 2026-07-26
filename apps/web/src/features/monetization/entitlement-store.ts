/**
 * Client entitlement cache for UI (ads, paywall CTA, settings badge).
 *
 * Server Edge Functions re-read app_metadata.plan and never trust this store.
 * Dev overrides (localStorage tgp.plan / VITE_CHEF_PAID) affect UI only.
 */

import { create } from 'zustand';

import { devPlanOverride } from './config';
import {
  freeSnapshot,
  paidSnapshot,
  planToTier,
  tierFromRevenueCatCustomerInfo,
  tierFromSessionMetadata,
} from './entitlements';
import type { EntitlementSnapshot, EntitlementTier } from './types';
import { getPurchasesBridge } from './purchases';

export type EntitlementState = {
  snapshot: EntitlementSnapshot;
  loading: boolean;
  error: string | null;
  /** Refresh from session + RevenueCat (best-effort). */
  refresh: () => Promise<EntitlementSnapshot>;
  /** Test / paywall sandbox helper — does NOT grant server entitlement. */
  setLocalTier: (tier: EntitlementTier, source?: EntitlementSnapshot['source']) => void;
  /** True when UI should treat user as paid (ads off, chef unlocked in UI). */
  isPaid: () => boolean;
};

export const useEntitlementStore = create<EntitlementState>((set, get) => ({
  snapshot: freeSnapshot(),
  loading: false,
  error: null,

  isPaid: () => get().snapshot.tier === 'paid',

  setLocalTier: (tier, source = 'dev_override') => {
    if (tier === 'paid') {
      set({ snapshot: paidSnapshot(source), error: null });
      try {
        localStorage.setItem('tgp.plan', 'paid');
      } catch {
        /* ignore */
      }
    } else {
      set({ snapshot: freeSnapshot(source), error: null });
      try {
        localStorage.setItem('tgp.plan', 'free');
      } catch {
        /* ignore */
      }
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const override = devPlanOverride();
      if (override === 'paid') {
        const snap = paidSnapshot('dev_override');
        set({ snapshot: snap, loading: false });
        return snap;
      }
      if (override === 'free') {
        const snap = freeSnapshot('dev_override');
        set({ snapshot: snap, loading: false });
        return snap;
      }

      // 1) Supabase session app_metadata (webhook mirror — source of truth for UI after purchase).
      let sessionTier: EntitlementTier | null = null;
      try {
        const { getSupabaseClient } = await import('../../supabase/config');
        const client = getSupabaseClient();
        if (client) {
          const { data } = await client.auth.getUser();
          const user = data.user;
          if (user) {
            sessionTier = tierFromSessionMetadata(
              user.app_metadata as Record<string, unknown>,
              user.user_metadata as Record<string, unknown>,
            );
            if (sessionTier === 'paid') {
              const plan = normalizePlanFromMeta(
                user.app_metadata as Record<string, unknown>,
                user.user_metadata as Record<string, unknown>,
              );
              const snap = paidSnapshot('session', plan);
              set({ snapshot: snap, loading: false });
              return snap;
            }
          }
        }
      } catch {
        /* offline / unconfigured */
      }

      // 2) RevenueCat customer info (native / web billing when configured).
      try {
        const bridge = getPurchasesBridge();
        const info = await bridge.getCustomerInfo();
        if (info) {
          const rcTier = tierFromRevenueCatCustomerInfo(info);
          if (rcTier === 'paid') {
            const snap = paidSnapshot('revenuecat');
            set({ snapshot: snap, loading: false });
            return snap;
          }
        }
      } catch {
        /* plugin missing */
      }

      const snap =
        sessionTier === 'paid'
          ? paidSnapshot('session')
          : freeSnapshot(sessionTier ? 'session' : 'default');
      set({ snapshot: snap, loading: false });
      return snap;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: message });
      return get().snapshot;
    }
  },
}));

function normalizePlanFromMeta(
  app: Record<string, unknown> | null | undefined,
  user: Record<string, unknown> | null | undefined,
): 'paid' | 'pro' | 'unlimited' {
  const plan = (app?.plan ?? user?.plan) as string | undefined;
  if (plan === 'pro' || plan === 'unlimited' || plan === 'paid') return plan;
  return 'paid';
}

/** Convenience selector. */
export function selectIsPaid(state: EntitlementState): boolean {
  return state.snapshot.tier === 'paid';
}

export function selectTier(state: EntitlementState): EntitlementTier {
  return state.snapshot.tier;
}

// re-export for callers that already import planToTier nearby
export { planToTier };
