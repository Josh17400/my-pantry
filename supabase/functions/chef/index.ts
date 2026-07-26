/**
 * Supabase Edge Function: chef (AI chef — paid tier)
 *
 * POST JSON:
 *   {
 *     action?: "chat",
 *     messages: [{ role, content }],
 *     intent?: "chat" | "what_can_i_make" | "substitute" | "generate_recipe" | "cooking_qa",
 *     pantry?: PantrySnapshotItem[],
 *     dietary?: { avoidAllergens, avoidDietaryFlags, notes? },
 *     recipe?: RecipeContext,
 *     catalog?: CatalogIngredientRef[],
 *     householdId?: string,
 *     stream?: boolean
 *   }
 *
 * Auth: Bearer Supabase JWT required.
 * Entitlement: paid / pro / unlimited only.
 * Secrets: OPENROUTER_API_KEY (function secret only — never VITE_).
 */

import { createClient } from '@supabase/supabase-js';
import { runChefChat } from './lib/pipeline.ts';
import { safeLog } from './lib/privacy.ts';
import type {
  Allergen,
  CatalogIngredientRef,
  ChefIntent,
  ChefMessage,
  DietaryFlag,
  DietaryProfile,
  FunctionResponse,
  PantrySnapshotItem,
  RecipeContext,
  RequestBody,
} from './lib/types.ts';
import {
  ALLERGENS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_QUOTA_CONFIG,
  DEFAULT_RECIPE_MODEL,
  DIETARY_FLAGS,
  isAllergen,
  isDietaryFlag,
} from './lib/types.ts';
import { OpenRouterChefClient, pricingFromEnv } from './lib/llm.ts';
import {
  InMemoryUsageStore,
  SupabaseUsageStore,
} from './lib/usage_store.ts';

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
    case 'entitlement_required':
      return 402;
    case 'missing_secret':
      return 503;
    case 'invalid_request':
      return 400;
    case 'rate_limited':
      return 429;
    case 'budget_exceeded':
      return 402;
    case 'safety_blocked':
      return 422;
    case 'schema_violation':
    case 'model_error':
      return 502;
    default:
      return 500;
  }
}

function envGet(key: string): string | undefined {
  return Deno.env.get(key) ?? undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseAllergens(v: unknown): Allergen[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Allergen => typeof x === 'string' && isAllergen(x));
}

function parseFlags(v: unknown): DietaryFlag[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is DietaryFlag => typeof x === 'string' && isDietaryFlag(x),
  );
}

function parseBody(raw: unknown): RequestBody | { error: string } {
  if (!isRecord(raw)) return { error: 'Body must be a JSON object.' };
  if (!Array.isArray(raw.messages)) {
    return { error: 'messages must be an array.' };
  }
  const messages: ChefMessage[] = [];
  for (let i = 0; i < raw.messages.length; i++) {
    const m = raw.messages[i];
    if (!isRecord(m)) return { error: `messages[${i}] must be an object.` };
    const role = m.role;
    const content = m.content;
    if (role !== 'user' && role !== 'assistant' && role !== 'system') {
      return { error: `messages[${i}].role invalid.` };
    }
    if (typeof content !== 'string' || !content.trim()) {
      return { error: `messages[${i}].content required.` };
    }
    messages.push({ role, content });
  }

  let intent: ChefIntent | undefined;
  if (typeof raw.intent === 'string') {
    const allowed: ChefIntent[] = [
      'chat',
      'what_can_i_make',
      'substitute',
      'generate_recipe',
      'cooking_qa',
    ];
    if ((allowed as string[]).includes(raw.intent)) {
      intent = raw.intent as ChefIntent;
    }
  }

  let pantry: PantrySnapshotItem[] | undefined;
  if (Array.isArray(raw.pantry)) {
    pantry = [];
    for (const row of raw.pantry) {
      if (!isRecord(row)) continue;
      const ingredientId = typeof row.ingredientId === 'string'
        ? row.ingredientId
        : typeof row.id === 'string'
          ? row.id
          : null;
      const name = typeof row.name === 'string' ? row.name : null;
      if (!ingredientId || !name) continue;
      pantry.push({
        ingredientId,
        name,
        qtyBase: typeof row.qtyBase === 'number' ? row.qtyBase : undefined,
        dim:
          row.dim === 'mass' || row.dim === 'volume' || row.dim === 'count'
            ? row.dim
            : undefined,
        formId: typeof row.formId === 'string' ? row.formId : undefined,
        allergens: parseAllergens(row.allergens),
        dietaryFlags: parseFlags(row.dietaryFlags),
        unknownAllergens: row.unknownAllergens === true,
      });
    }
  }

  let dietary: DietaryProfile | undefined;
  if (isRecord(raw.dietary)) {
    dietary = {
      avoidAllergens: parseAllergens(raw.dietary.avoidAllergens),
      avoidDietaryFlags: parseFlags(raw.dietary.avoidDietaryFlags),
      notes:
        typeof raw.dietary.notes === 'string' ? raw.dietary.notes : undefined,
    };
  }

  let recipe: RecipeContext | undefined;
  if (isRecord(raw.recipe)) {
    recipe = {
      id: typeof raw.recipe.id === 'string' ? raw.recipe.id : undefined,
      title: typeof raw.recipe.title === 'string' ? raw.recipe.title : undefined,
      servings:
        typeof raw.recipe.servings === 'number'
          ? raw.recipe.servings
          : undefined,
      ingredients: Array.isArray(raw.recipe.ingredients)
        ? raw.recipe.ingredients
            .filter(isRecord)
            .map((line) => ({
              ingredientId:
                typeof line.ingredientId === 'string'
                  ? line.ingredientId
                  : undefined,
              rawText:
                typeof line.rawText === 'string'
                  ? line.rawText
                  : typeof line.name === 'string'
                    ? line.name
                    : '',
              qty: typeof line.qty === 'number' ? line.qty : null,
              unit: typeof line.unit === 'string' ? line.unit : null,
              allergens: parseAllergens(line.allergens),
              dietaryFlags: parseFlags(line.dietaryFlags),
              unknownAllergens: line.unknownAllergens === true,
            }))
            .filter((l) => l.rawText.length > 0)
        : undefined,
      steps: Array.isArray(raw.recipe.steps)
        ? raw.recipe.steps.filter((s): s is string => typeof s === 'string')
        : undefined,
    };
  }

  let catalog: CatalogIngredientRef[] | undefined;
  if (Array.isArray(raw.catalog)) {
    catalog = [];
    for (const row of raw.catalog) {
      if (!isRecord(row)) continue;
      const id = typeof row.id === 'string' ? row.id : null;
      const name = typeof row.name === 'string' ? row.name : null;
      if (!id || !name) continue;
      catalog.push({
        id,
        name,
        allergens: parseAllergens(row.allergens),
        dietaryFlags: parseFlags(row.dietaryFlags),
      });
    }
  }

  return {
    action: 'chat',
    messages,
    intent,
    pantry,
    dietary,
    recipe,
    catalog,
    householdId:
      typeof raw.householdId === 'string' ? raw.householdId : undefined,
    stream: raw.stream === true,
  };
}

function resolveQuotaFromEnv(isPaid: boolean) {
  const budget = envGet('CHEF_MONTHLY_BUDGET_USD');
  const rate = envGet('CHEF_RATE_LIMIT_COUNT');
  const windowMs = envGet('CHEF_RATE_LIMIT_WINDOW_MS');
  return {
    isPaid,
    monthlyBudgetUsd: budget
      ? Number(budget)
      : DEFAULT_QUOTA_CONFIG.monthlyBudgetUsd,
    rateLimitCount: rate
      ? Number(rate)
      : DEFAULT_QUOTA_CONFIG.rateLimitCount,
    rateLimitWindowMs: windowMs
      ? Number(windowMs)
      : DEFAULT_QUOTA_CONFIG.rateLimitWindowMs,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse(
      { ok: false, code: 'invalid_request', message: 'POST only.' },
      400,
    );
  }

  const supabaseUrl = envGet('SUPABASE_URL');
  const anonKey = envGet('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return jsonResponse(
      {
        ok: false,
        code: 'missing_secret',
        message: 'Supabase runtime env missing.',
      },
      503,
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(
      {
        ok: false,
        code: 'unauthorized',
        message: 'Bearer JWT required.',
      },
      401,
    );
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonResponse(
      {
        ok: false,
        code: 'unauthorized',
        message: 'Invalid or expired session.',
      },
      401,
    );
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return jsonResponse(
      { ok: false, code: 'invalid_request', message: 'Invalid JSON body.' },
      400,
    );
  }

  const parsed = parseBody(bodyJson);
  if ('error' in parsed) {
    return jsonResponse(
      { ok: false, code: 'invalid_request', message: parsed.error },
      400,
    );
  }
  const body = parsed;

  const plan = (user.app_metadata?.plan ?? user.user_metadata?.plan) as
    | string
    | undefined;
  const isPaid = plan === 'paid' || plan === 'pro' || plan === 'unlimited';

  const serviceKey = envGet('SUPABASE_SERVICE_ROLE_KEY');
  const usage =
    serviceKey && envGet('CHEF_USAGE_BACKEND') !== 'memory'
      ? new SupabaseUsageStore(
          createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          }) as unknown as ConstructorParameters<typeof SupabaseUsageStore>[0],
        )
      : new InMemoryUsageStore();

  // Free users never reach OpenRouter — clear upsell only.
  if (!isPaid) {
    const result = await runChefChat(
      {
        llm: {
          async complete() {
            throw new Error('unreachable');
          },
        },
        usage,
        quota: resolveQuotaFromEnv(false),
        isPaid: false,
      },
      {
        userId: user.id,
        householdId: body.householdId,
        messages: body.messages,
        intent: body.intent,
        pantry: body.pantry,
        dietary: body.dietary,
        recipe: body.recipe,
        catalog: body.catalog,
      },
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

  // Silence unused import lint for constants re-exported for operators.
  void ALLERGENS;
  void DIETARY_FLAGS;

  const llm = new OpenRouterChefClient({
    apiKey: openRouterKey,
    chatModel: envGet('CHEF_CHAT_MODEL') ?? DEFAULT_CHAT_MODEL,
    recipeModel: envGet('CHEF_RECIPE_MODEL') ?? DEFAULT_RECIPE_MODEL,
    pricing: pricingFromEnv({ get: envGet }),
  });

  const result = await runChefChat(
    {
      llm,
      usage,
      pricing: pricingFromEnv({ get: envGet }),
      quota: resolveQuotaFromEnv(true),
      isPaid: true,
    },
    {
      userId: user.id,
      householdId: body.householdId,
      messages: body.messages,
      intent: body.intent,
      pantry: body.pantry,
      dietary: body.dietary,
      recipe: body.recipe,
      catalog: body.catalog,
    },
  );

  return jsonResponse(result, statusFor(result));
});
