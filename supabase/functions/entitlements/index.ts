/**
 * Supabase Edge Function: entitlements
 *
 * POST actions:
 *  1) RevenueCat webhook (Authorization: Bearer REVENUECAT_WEBHOOK_SECRET
 *     or query ?secret=) — updates auth.users app_metadata.plan
 *  2) { action: "delete_account" } with user JWT — deletes auth user
 *
 * Never trusts a client claim of entitlement. Chef + parse-receipt read
 * app_metadata.plan only after this mirror runs.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  applyRevenueCatEvent,
  deleteAuthUser,
  type AdminAuthClient,
} from './lib/apply.ts';
import type { RevenueCatWebhookBody } from './lib/types.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-revenuecat-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function envGet(key: string): string | undefined {
  return Deno.env.get(key) ?? undefined;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function webhookAuthorized(req: Request): boolean {
  const secret = envGet('REVENUECAT_WEBHOOK_SECRET');
  if (!secret) {
    // In local/dev without secret, only allow when explicitly enabled.
    return envGet('ENTITLEMENTS_ALLOW_INSECURE') === 'true';
  }
  const auth = req.headers.get('Authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const headerSecret = req.headers.get('X-RevenueCat-Secret') ?? '';
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret') ?? '';
  return (
    timingSafeEqual(bearer, secret) ||
    timingSafeEqual(headerSecret, secret) ||
    timingSafeEqual(querySecret, secret)
  );
}

function getServiceClient(): AdminAuthClient | null {
  const url = envGet('SUPABASE_URL') ?? envGet('SB_URL');
  const key = envGet('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as AdminAuthClient;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return json({ ok: false, code: 'invalid_payload', error: 'Invalid JSON' }, 400);
  }

  // ── Account deletion (user JWT) ──────────────────────────────────────────
  if (isRecord(bodyJson) && bodyJson.action === 'delete_account') {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) {
      return json({ ok: false, code: 'unauthorized', error: 'Missing bearer' }, 401);
    }
    const jwt = auth.slice(7).trim();
    const supabaseUrl = envGet('SUPABASE_URL') ?? envGet('SB_URL');
    const anon = envGet('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anon) {
      return json(
        { ok: false, code: 'not_configured', error: 'Auth not configured' },
        503,
      );
    }
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return json({ ok: false, code: 'unauthorized', error: 'Invalid session' }, 401);
    }
    const admin = getServiceClient();
    if (!admin) {
      return json(
        {
          ok: false,
          code: 'not_configured',
          error: 'Service role not configured for deletion',
        },
        503,
      );
    }
    const del = await deleteAuthUser(userData.user.id, admin);
    if (!del.ok) {
      return json({ ok: false, code: 'internal', error: del.error }, 500);
    }
    return json({ ok: true, userId: userData.user.id });
  }

  // ── RevenueCat webhook ───────────────────────────────────────────────────
  if (!webhookAuthorized(req)) {
    return json({ ok: false, code: 'unauthorized', error: 'Unauthorized' }, 401);
  }

  const body = bodyJson as RevenueCatWebhookBody;
  const event = body.event ?? (bodyJson as RevenueCatWebhookBody['event']);
  if (!event || typeof event !== 'object') {
    return json(
      { ok: false, code: 'invalid_payload', error: 'Missing event' },
      400,
    );
  }

  const admin = getServiceClient();
  // When service role missing, still return decision for dry-run tests.
  const result = await applyRevenueCatEvent(event, admin);

  if (!result.ok) {
    return json(
      {
        ok: false,
        code: 'internal',
        error: result.error ?? 'apply failed',
        action: result.action,
        userId: result.userId,
      },
      500,
    );
  }

  return json({
    ok: true,
    action: result.action,
    userId: result.userId,
    plan: result.plan,
  });
});
