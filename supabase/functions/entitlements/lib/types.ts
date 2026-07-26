/**
 * RevenueCat webhook + account-deletion types for the entitlements function.
 */

export type PlanId = 'free' | 'paid' | 'pro' | 'unlimited';

export type EntitlementRecord = {
  readonly userId: string;
  readonly plan: PlanId;
  readonly entitlementId: string | null;
  readonly productId: string | null;
  readonly expiresAt: string | null;
  readonly updatedAt: string;
  readonly source: 'revenuecat' | 'manual' | 'delete';
};

export type WebhookResult =
  | {
      readonly ok: true;
      readonly action: 'grant' | 'revoke' | 'noop';
      readonly userId: string | null;
      readonly plan: PlanId;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code:
        | 'unauthorized'
        | 'invalid_payload'
        | 'missing_user'
        | 'internal';
    };

export type DeleteAccountResult =
  | { readonly ok: true; readonly userId: string }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code: 'unauthorized' | 'not_configured' | 'internal';
    };

/** Minimal RevenueCat webhook event shape we care about. */
export type RevenueCatEvent = {
  readonly type?: string;
  readonly app_user_id?: string;
  readonly original_app_user_id?: string;
  readonly product_id?: string;
  readonly entitlement_ids?: readonly string[];
  readonly expiration_at_ms?: number | null;
  readonly purchased_at_ms?: number | null;
  readonly environment?: string;
  readonly store?: string;
  readonly period_type?: string;
};

export type RevenueCatWebhookBody = {
  readonly api_version?: string;
  readonly event?: RevenueCatEvent;
};
