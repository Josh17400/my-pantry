/**
 * Pure plan resolution from RevenueCat webhook events.
 * Server-only authority for app_metadata.plan — clients never set this.
 */

import type { PlanId, RevenueCatEvent } from './types.ts';

/** Events that mean the user currently has (or just gained) access. */
export const GRANT_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

/** Events that mean access should be removed (or already gone). */
export const REVOKE_EVENT_TYPES = new Set([
  'EXPIRATION',
  'CANCELLATION', // cancel alone does not always end access — still active until period end
]);

/**
 * Cancellation keeps access until expiration — we only revoke on EXPIRATION
 * (and explicit TRANSFER / subscriber-alias handling elsewhere).
 */
export const HARD_REVOKE_EVENT_TYPES = new Set([
  'EXPIRATION',
]);

export const PRO_ENTITLEMENT_IDS = new Set([
  'good_pantry_pro',
  'pro',
  'paid',
]);

export function isProEntitlement(id: string | undefined | null): boolean {
  if (!id) return false;
  return PRO_ENTITLEMENT_IDS.has(id);
}

export function eventHasProEntitlement(event: RevenueCatEvent): boolean {
  const ids = event.entitlement_ids ?? [];
  if (ids.some((id) => isProEntitlement(id))) return true;
  // Product id convention when entitlement_ids omitted in some payloads.
  const product = event.product_id ?? '';
  if (product.includes('good_pantry_pro') || product.includes('pro')) {
    return true;
  }
  return false;
}

export type PlanDecision =
  | { readonly action: 'grant'; readonly plan: PlanId }
  | { readonly action: 'revoke'; readonly plan: 'free' }
  | { readonly action: 'noop'; readonly plan: PlanId | null };

/**
 * Decide grant / revoke / noop from a RevenueCat event.
 * Pure — unit tested without network.
 */
export function decidePlanFromEvent(event: RevenueCatEvent): PlanDecision {
  const type = (event.type ?? '').toUpperCase();

  if (HARD_REVOKE_EVENT_TYPES.has(type)) {
    return { action: 'revoke', plan: 'free' };
  }

  // Cancellation: keep paid until EXPIRATION arrives.
  if (type === 'CANCELLATION') {
    return { action: 'noop', plan: null };
  }

  if (GRANT_EVENT_TYPES.has(type)) {
    if (eventHasProEntitlement(event) || !event.entitlement_ids) {
      // If entitlements array empty but it's a purchase event, still grant pro
      // when product looks like ours; otherwise grant pro for INITIAL_PURCHASE
      // of any product mapped in RC dashboard to our app.
      return { action: 'grant', plan: 'pro' };
    }
    return { action: 'noop', plan: null };
  }

  // TRANSFER / SUBSCRIBER_ALIAS — treat as noop here (handled by app_user_id).
  if (type === 'TRANSFER' || type === 'SUBSCRIBER_ALIAS') {
    return { action: 'noop', plan: null };
  }

  // BILLING_ISSUE — keep access; store may grace.
  if (type === 'BILLING_ISSUE') {
    return { action: 'noop', plan: null };
  }

  // TEST events in sandbox — grant so owner can verify webhook wiring.
  if (type === 'TEST' || type === 'TEST_EVENT') {
    return { action: 'grant', plan: 'pro' };
  }

  return { action: 'noop', plan: null };
}

export function resolveAppUserId(event: RevenueCatEvent): string | null {
  const id = event.app_user_id ?? event.original_app_user_id;
  if (typeof id !== 'string' || id.length === 0) return null;
  // Anonymous RC ids are not Supabase UUIDs — still return for logging;
  // apply layer may skip non-UUID.
  return id;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSupabaseUserId(id: string): boolean {
  return UUID_RE.test(id);
}

export function expiresAtIso(event: RevenueCatEvent): string | null {
  const ms = event.expiration_at_ms;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}
