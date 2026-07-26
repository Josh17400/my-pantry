/**
 * Supabase Edge Function: parse-receipt
 *
 * POST JSON:
 *   { action?: "parse", images: [...], locale?, householdId?, retainImage?, knownAllergensByUpc? }
 *   { action: "commit", attemptId, committedLineCount }
 *   { action: "abandon", attemptId }
 *
 * Auth: Bearer Supabase JWT required (anon key alone is not enough).
 * Secrets: OPENROUTER_API_KEY (function secret). SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY provided by runtime.
 *
 * Privacy: images are never persisted by this function; never logged at info.
 */

import { createClient } from '@supabase/supabase-js';
import { runAbandon, runCommit, runParse } from './lib/pipeline.ts';
import { safeLog } from './lib/privacy.ts';
import type {
  Allergen,
  FunctionResponse,
  ParseActionBody,
  QuotaConfig,
  ReceiptImageInput,
  RequestBody,
} from './lib/types.ts';
import {
  ALLERGENS,
  DEFAULT_GATE_MODEL,
  DEFAULT_VISION_MODEL,
} from './lib/types.ts';
import { InMemoryUsageStore, SupabaseUsageStore } from './lib/usage_store.ts';
import { OpenRouterVisionClient, pricingFromEnv } from './lib/vision.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: FunctionResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function statusFor(body: FunctionResponse): number {
  if (body.ok) return 200;
  switch (body.code) {
    case 'unauthorized':
      return 401;
    case 'missing_secret':
      return 503;
    case 'invalid_request':
      return 400;
    case 'quota_exceeded':
    case 'budget_exceeded':
      return 402;
    case 'not_grocery':
      return 422;
    case 'schema_violation':
    case 'model_error':
    case 'unreadable':
      return 502;
    default:
      return 500;
  }
}

function envGet(key: string): string | undefined {
  return Deno.env.get(key) ?? undefined;
}

function resolveQuotaFromEnv(isPaid: boolean): Partial<QuotaConfig> {
  const free = envGet('RECEIPT_FREE_SCAN_LIMIT');
  const budget = envGet('RECEIPT_MONTHLY_BUDGET_USD');
  const paidBudget = envGet('RECEIPT_PAID_MONTHLY_BUDGET_USD');
  return {
    isPaid,
    freeScanLimit: free ? Number(free) : undefined,
    monthlyBudgetUsd: budget ? Number(budget) : undefined,
    paidMonthlyBudgetUsd: paidBudget ? Number(paidBudget) : undefined,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseBody(raw: unknown): RequestBody | { error: string } {
  if (!isRecord(raw)) return { error: 'Body must be a JSON object.' };
  const action = raw.action;
  if (action === 'commit') {
    if (typeof raw.attemptId !== 'string' || !raw.attemptId) {
      return { error: 'commit requires attemptId.' };
    }
    const count = raw.committedLineCount;
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
      return { error: 'commit requires committedLineCount >= 0.' };
    }
    return {
      action: 'commit',
      attemptId: raw.attemptId,
      committedLineCount: count,
    };
  }
  if (action === 'abandon') {
    if (typeof raw.attemptId !== 'string' || !raw.attemptId) {
      return { error: 'abandon requires attemptId.' };
    }
    return { action: 'abandon', attemptId: raw.attemptId };
  }
  // parse (default)
  if (!Array.isArray(raw.images)) {
    return { error: 'parse requires images: array.' };
  }
  const images: ReceiptImageInput[] = raw.images.map((img, i) => {
    if (!isRecord(img)) throw new Error(`images[${i}] must be object`);
    let mimeType: ReceiptImageInput['mimeType'];
    if (
      img.mimeType === 'image/jpeg' ||
      img.mimeType === 'image/png' ||
      img.mimeType === 'image/webp' ||
      img.mimeType === 'image/heic'
    ) {
      mimeType = img.mimeType;
    }
    return {
      data: typeof img.data === 'string' ? img.data : undefined,
      url: typeof img.url === 'string' ? img.url : undefined,
      mimeType,
    };
  });
  let knownAllergensByUpc:
    | Readonly<Record<string, readonly Allergen[]>>
    | undefined;
  if (raw.knownAllergensByUpc && isRecord(raw.knownAllergensByUpc)) {
    const map: Record<string, Allergen[]> = {};
    for (const [upc, tags] of Object.entries(raw.knownAllergensByUpc)) {
      if (!Array.isArray(tags)) continue;
      map[upc] = tags.filter((t): t is Allergen =>
        (ALLERGENS as readonly string[]).includes(String(t)),
      );
    }
    knownAllergensByUpc = map;
  }
  const body: ParseActionBody = {
    action: 'parse',
    images,
    locale: typeof raw.locale === 'string' ? raw.locale : undefined,
    householdId:
      typeof raw.householdId === 'string' ? raw.householdId : undefined,
    retainImage: raw.retainImage === true,
    knownAllergensByUpc,
  };
  return body;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse(
      {
        ok: false,
        code: 'invalid_request',
        message: 'POST only.',
      },
      405,
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(
      {
        ok: false,
        code: 'unauthorized',
        message: 'Missing Authorization Bearer token.',
      },
      401,
    );
  }

  const supabaseUrl = envGet('SUPABASE_URL');
  const supabaseAnon = envGet('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnon) {
    safeLog('error', 'missing_supabase_env', {});
    return jsonResponse(
      {
        ok: false,
        code: 'internal',
        message: 'Supabase runtime env not configured.',
      },
      500,
    );
  }

  const userClient = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse(
      {
        ok: false,
        code: 'unauthorized',
        message: 'Invalid or expired JWT.',
      },
      401,
    );
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return jsonResponse(
      {
        ok: false,
        code: 'invalid_request',
        message: 'Invalid JSON body.',
      },
      400,
    );
  }

  let body: RequestBody;
  try {
    const parsed = parseBody(bodyJson);
    if ('error' in parsed) {
      return jsonResponse(
        { ok: false, code: 'invalid_request', message: parsed.error },
        400,
      );
    }
    body = parsed;
  } catch (e) {
    return jsonResponse(
      {
        ok: false,
        code: 'invalid_request',
        message: e instanceof Error ? e.message : 'Invalid body.',
      },
      400,
    );
  }

  // Entitlement: optional app_metadata.plan === 'paid' | 'pro'
  const plan = (user.app_metadata?.plan ?? user.user_metadata?.plan) as
    | string
    | undefined;
  const isPaid = plan === 'paid' || plan === 'pro' || plan === 'unlimited';

  const serviceKey = envGet('SUPABASE_SERVICE_ROLE_KEY');
  const usage =
    serviceKey && envGet('RECEIPT_USAGE_BACKEND') !== 'memory'
      ? new SupabaseUsageStore(
          createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          }) as unknown as ConstructorParameters<typeof SupabaseUsageStore>[0],
        )
      : new InMemoryUsageStore();

  // commit / abandon do not need OpenRouter
  if (body.action === 'commit') {
    const result = await runCommit(
      { usage, quota: resolveQuotaFromEnv(isPaid) },
      {
        userId: user.id,
        attemptId: body.attemptId,
        committedLineCount: body.committedLineCount,
      },
    );
    return jsonResponse(result, statusFor(result));
  }

  if (body.action === 'abandon') {
    const result = await runAbandon(
      { usage, quota: resolveQuotaFromEnv(isPaid) },
      { userId: user.id, attemptId: body.attemptId },
    );
    return jsonResponse(result, statusFor(result));
  }

  const openRouterKey = envGet('OPENROUTER_API_KEY');
  if (!openRouterKey) {
    safeLog('error', 'missing_openrouter_key', { userId: user.id });
    return jsonResponse(
      {
        ok: false,
        code: 'missing_secret',
        message:
          'OPENROUTER_API_KEY is not configured. Owner must run: supabase secrets set OPENROUTER_API_KEY=...',
      },
      503,
    );
  }

  const vision = new OpenRouterVisionClient({
    apiKey: openRouterKey,
    visionModel: envGet('RECEIPT_VISION_MODEL') ?? DEFAULT_VISION_MODEL,
    gateModel: envGet('RECEIPT_GATE_MODEL') ?? DEFAULT_GATE_MODEL,
    pricing: pricingFromEnv({ get: envGet }),
  });

  const result = await runParse(
    {
      vision,
      usage,
      pricing: pricingFromEnv({ get: envGet }),
      quota: resolveQuotaFromEnv(isPaid),
    },
    {
      userId: user.id,
      householdId: body.householdId,
      images: body.images,
      locale: body.locale,
      retainImage: body.retainImage,
      knownAllergensByUpc: body.knownAllergensByUpc,
    },
  );

  return jsonResponse(result, statusFor(result));
});
