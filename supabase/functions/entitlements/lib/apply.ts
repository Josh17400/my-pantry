/**
 * Apply entitlement plan onto Supabase auth users (app_metadata.plan).
 * Never trusts client claims — only webhook + service role.
 */

import type { PlanId, RevenueCatEvent } from './types.ts';
import {
  decidePlanFromEvent,
  expiresAtIso,
  isSupabaseUserId,
  resolveAppUserId,
} from './plan.ts';

export type AdminAuthClient = {
  auth: {
    admin: {
      getUserById(id: string): Promise<{
        data: { user: { id: string; app_metadata?: Record<string, unknown> } | null };
        error: { message: string } | null;
      }>;
      updateUserById(
        id: string,
        attrs: { app_metadata?: Record<string, unknown> },
      ): Promise<{
        data: { user: { id: string } | null };
        error: { message: string } | null;
      }>;
      deleteUser(id: string): Promise<{
        data: { user: unknown };
        error: { message: string } | null;
      }>;
    };
  };
};

export type ApplyWebhookResult = {
  readonly ok: boolean;
  readonly action: 'grant' | 'revoke' | 'noop' | 'skipped';
  readonly userId: string | null;
  readonly plan: PlanId | null;
  readonly error?: string;
};

/**
 * Pure decision + optional admin write.
 * When admin is null, returns the decision without side effects (tests).
 */
export async function applyRevenueCatEvent(
  event: RevenueCatEvent,
  admin: AdminAuthClient | null,
): Promise<ApplyWebhookResult> {
  const decision = decidePlanFromEvent(event);
  const userId = resolveAppUserId(event);

  if (decision.action === 'noop') {
    return {
      ok: true,
      action: 'noop',
      userId,
      plan: decision.plan,
    };
  }

  if (!userId) {
    return {
      ok: false,
      action: 'skipped',
      userId: null,
      plan: null,
      error: 'missing app_user_id',
    };
  }

  if (!isSupabaseUserId(userId)) {
    // RC anonymous ids — cannot map to auth.users without identify() linking.
    return {
      ok: true,
      action: 'skipped',
      userId,
      plan: decision.plan,
      error: 'app_user_id is not a Supabase UUID — call Purchases.logIn(user.id)',
    };
  }

  if (!admin) {
    return {
      ok: true,
      action: decision.action,
      userId,
      plan: decision.plan,
    };
  }

  const plan: PlanId = decision.action === 'grant' ? decision.plan : 'free';
  const { data: existing, error: getErr } =
    await admin.auth.admin.getUserById(userId);
  if (getErr || !existing.user) {
    return {
      ok: false,
      action: decision.action,
      userId,
      plan,
      error: getErr?.message ?? 'user not found',
    };
  }

  const prevMeta = (existing.user.app_metadata ?? {}) as Record<string, unknown>;
  const nextMeta: Record<string, unknown> = {
    ...prevMeta,
    plan,
    entitlement_source: 'revenuecat',
    entitlement_updated_at: new Date().toISOString(),
    entitlement_product_id: event.product_id ?? null,
    entitlement_expires_at: expiresAtIso(event),
  };

  const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: nextMeta,
  });
  if (upErr) {
    return {
      ok: false,
      action: decision.action,
      userId,
      plan,
      error: upErr.message,
    };
  }

  return {
    ok: true,
    action: decision.action,
    userId,
    plan,
  };
}

export async function deleteAuthUser(
  userId: string,
  admin: AdminAuthClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
