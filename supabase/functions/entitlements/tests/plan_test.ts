import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decidePlanFromEvent,
  isSupabaseUserId,
  resolveAppUserId,
} from '../lib/plan.ts';
import { applyRevenueCatEvent } from '../lib/apply.ts';
import type { AdminAuthClient } from '../lib/apply.ts';

Deno.test('grant: INITIAL_PURCHASE sets pro', () => {
  const d = decidePlanFromEvent({
    type: 'INITIAL_PURCHASE',
    app_user_id: '11111111-1111-4111-8111-111111111111',
    product_id: 'good_pantry_pro_monthly',
    entitlement_ids: ['good_pantry_pro'],
  });
  assertEquals(d.action, 'grant');
  if (d.action === 'grant') assertEquals(d.plan, 'pro');
});

Deno.test('grant: RENEWAL keeps pro', () => {
  const d = decidePlanFromEvent({
    type: 'RENEWAL',
    entitlement_ids: ['good_pantry_pro'],
  });
  assertEquals(d.action, 'grant');
});

Deno.test('revoke: EXPIRATION sets free', () => {
  const d = decidePlanFromEvent({ type: 'EXPIRATION' });
  assertEquals(d.action, 'revoke');
  if (d.action === 'revoke') assertEquals(d.plan, 'free');
});

Deno.test('noop: CANCELLATION does not revoke early', () => {
  const d = decidePlanFromEvent({ type: 'CANCELLATION' });
  assertEquals(d.action, 'noop');
});

Deno.test('TEST event grants for sandbox wiring', () => {
  const d = decidePlanFromEvent({ type: 'TEST' });
  assertEquals(d.action, 'grant');
});

Deno.test('resolveAppUserId prefers app_user_id', () => {
  assertEquals(
    resolveAppUserId({
      app_user_id: 'u1',
      original_app_user_id: 'u0',
    }),
    'u1',
  );
});

Deno.test('isSupabaseUserId validates UUID', () => {
  assertEquals(
    isSupabaseUserId('11111111-1111-4111-8111-111111111111'),
    true,
  );
  assertEquals(isSupabaseUserId('$RCAnonymousID:abc'), false);
});

Deno.test('applyRevenueCatEvent dry-run grants without admin', async () => {
  const result = await applyRevenueCatEvent(
    {
      type: 'INITIAL_PURCHASE',
      app_user_id: '11111111-1111-4111-8111-111111111111',
      entitlement_ids: ['good_pantry_pro'],
    },
    null,
  );
  assertEquals(result.ok, true);
  assertEquals(result.action, 'grant');
  assertEquals(result.plan, 'pro');
});

Deno.test('applyRevenueCatEvent updates app_metadata via admin mock', async () => {
  const writes: Array<{ id: string; plan: string }> = [];
  const admin: AdminAuthClient = {
    auth: {
      admin: {
        async getUserById(id) {
          return {
            data: {
              user: { id, app_metadata: { plan: 'free' } },
            },
            error: null,
          };
        },
        async updateUserById(id, attrs) {
          const plan = String(attrs.app_metadata?.plan ?? '');
          writes.push({ id, plan });
          return { data: { user: { id } }, error: null };
        },
        async deleteUser() {
          return { data: { user: null }, error: null };
        },
      },
    },
  };

  const uid = '22222222-2222-4222-8222-222222222222';
  const grant = await applyRevenueCatEvent(
    {
      type: 'INITIAL_PURCHASE',
      app_user_id: uid,
      product_id: 'good_pantry_pro_annual',
      entitlement_ids: ['good_pantry_pro'],
    },
    admin,
  );
  assertEquals(grant.ok, true);
  assertEquals(grant.action, 'grant');
  assertEquals(writes[0]?.plan, 'pro');

  const revoke = await applyRevenueCatEvent(
    { type: 'EXPIRATION', app_user_id: uid },
    admin,
  );
  assertEquals(revoke.ok, true);
  assertEquals(revoke.action, 'revoke');
  assertEquals(writes[1]?.plan, 'free');
});

Deno.test('apply skips anonymous RC ids without failing hard', async () => {
  const result = await applyRevenueCatEvent(
    {
      type: 'INITIAL_PURCHASE',
      app_user_id: '$RCAnonymousID:xyz',
      entitlement_ids: ['good_pantry_pro'],
    },
    null,
  );
  assertEquals(result.ok, true);
  assertEquals(result.action, 'skipped');
});
