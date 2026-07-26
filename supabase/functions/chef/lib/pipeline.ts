/**
 * Chef pipeline — entitlement → rate limit → dollar budget → LLM → safety gate.
 */

import {
  checkBudget,
  estimateChefBudgetUsd,
  estimateCostUsd,
  roundUsd,
} from './cost.ts';
import { buildChatMessages } from './prompts.ts';
import { checkEntitlement, checkRateLimit, resolveQuotaConfig } from './quota.ts';
import { enforceSafetyGate } from './safety_gate.ts';
import { safeLog } from './privacy.ts';
import type {
  CatalogIngredientRef,
  ChefIntent,
  ChefMessage,
  ChefSuccessResponse,
  DietaryProfile,
  ErrorResponse,
  FunctionResponse,
  ModelPricing,
  PantrySnapshotItem,
  QuotaConfig,
  RecipeContext,
} from './types.ts';
import { DEFAULT_PRICING } from './types.ts';
import type { ChefLlmClient } from './llm.ts';
import { ModelError, SchemaViolationError } from './llm.ts';
import type { UsageStore } from './usage_store.ts';

export interface PipelineDeps {
  readonly llm: ChefLlmClient;
  readonly usage: UsageStore;
  readonly pricing?: ModelPricing;
  readonly quota?: Partial<QuotaConfig>;
  readonly idFactory?: () => string;
  readonly now?: () => Date;
  readonly isPaid: boolean;
}

export interface ChatPipelineInput {
  readonly userId: string;
  readonly householdId?: string | null;
  readonly messages: readonly ChefMessage[];
  readonly intent?: ChefIntent;
  readonly pantry?: readonly PantrySnapshotItem[];
  readonly dietary?: DietaryProfile;
  readonly recipe?: RecipeContext;
  readonly catalog?: readonly CatalogIngredientRef[];
}

function defaultId(): string {
  return crypto.randomUUID();
}

function emptyDietary(): DietaryProfile {
  return { avoidAllergens: [], avoidDietaryFlags: [] };
}

function inferIntent(
  explicit: ChefIntent | undefined,
  messages: readonly ChefMessage[],
): ChefIntent {
  if (explicit) return explicit;
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const t = (last?.content ?? '').toLowerCase();
  if (/substitut|instead of|swap|replace/.test(t)) return 'substitute';
  if (/recipe|generate|invent|create a/.test(t)) return 'generate_recipe';
  if (/what can i (make|cook)|tonight|cookable|use up/.test(t)) {
    return 'what_can_i_make';
  }
  if (/how (do|long|much)|step|timer|temperature|oven/.test(t)) {
    return 'cooking_qa';
  }
  return 'chat';
}

function groundPantry(
  ids: readonly string[],
  pantry: readonly PantrySnapshotItem[],
): { ingredientId: string; name: string }[] {
  const byId = new Map(pantry.map((p) => [p.ingredientId, p]));
  const out: { ingredientId: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const p = byId.get(id);
    if (!p) continue;
    seen.add(id);
    out.push({ ingredientId: p.ingredientId, name: p.name });
  }
  return out;
}

export async function runChefChat(
  deps: PipelineDeps,
  input: ChatPipelineInput,
): Promise<FunctionResponse> {
  const idFactory = deps.idFactory ?? defaultId;
  const attemptId = idFactory();
  const quota = resolveQuotaConfig(deps.quota);
  const pricing = deps.pricing ?? DEFAULT_PRICING;
  const pantry = input.pantry ?? [];
  const dietary = input.dietary ?? emptyDietary();
  const catalog = input.catalog ?? [];
  const intent = inferIntent(input.intent, input.messages);

  // 1. Entitlement — paid only
  const ent = checkEntitlement(deps.isPaid);
  if (!ent.allowed) {
    return {
      ok: false,
      code: 'entitlement_required',
      message:
        'AI Chef is a paid feature. Upgrade to unlock pantry-aware cooking help, substitutions, and recipe generation.',
      upgradeUrl: '/settings/upgrade',
      attemptId,
    } satisfies ErrorResponse;
  }

  // 2. Rate limit
  const now = deps.now?.() ?? new Date();
  const windowStart = now.getTime() - quota.rateLimitWindowMs;
  const recent = await deps.usage.getRecentRequestTimes(
    input.userId,
    windowStart,
  );
  const rateSnap = {
    userId: input.userId,
    monthKey: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
    requestCount: recent.length,
    spentUsd: 0,
  };
  // Prefer month snapshot for dollars; use rolling window for rate.
  const monthSnap = await deps.usage.getSnapshot(input.userId);
  const rate = checkRateLimit(
    { ...rateSnap, spentUsd: monthSnap.spentUsd },
    quota,
  );
  if (!rate.allowed) {
    await deps.usage.createAttempt({
      id: attemptId,
      userId: input.userId,
      householdId: input.householdId ?? null,
      status: 'rate_limited',
      estimatedCostUsd: 0,
      promptTokens: 0,
      completionTokens: 0,
      model: null,
      intent,
    });
    return {
      ok: false,
      code: 'rate_limited',
      message: `Rate limit exceeded (${rate.limit} requests per hour). Try again later.`,
      attemptId,
      details: {
        requestCount: rate.requestCount,
        limit: rate.limit,
      },
    };
  }

  // 3. Dollar budget circuit breaker
  const estimated = estimateChefBudgetUsd({
    intent,
    pricing,
    messageCount: input.messages.length,
  });
  const budget = checkBudget({
    snapshot: monthSnap,
    config: quota,
    estimatedAdditionalUsd: estimated,
  });
  if (!budget.allowed) {
    return {
      ok: false,
      code: 'budget_exceeded',
      message:
        'Monthly AI Chef budget reached. Your plan will reset next month, or contact support for a higher ceiling.',
      attemptId,
      details: {
        spentUsd: budget.spentUsd,
        budgetUsd: budget.budgetUsd,
        remainingUsd: budget.remainingUsd,
      },
    };
  }

  if (!input.messages.length) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'messages array is required and must be non-empty.',
      attemptId,
    };
  }

  const chatMessages = buildChatMessages({
    intent,
    history: input.messages,
    pantry,
    dietary,
    recipe: input.recipe,
    catalog,
  });

  // 4. Model call
  let llmResult;
  try {
    llmResult = await deps.llm.complete({
      messages: chatMessages,
      intent,
    });
  } catch (e) {
    const cost = 0;
    await deps.usage.createAttempt({
      id: attemptId,
      userId: input.userId,
      householdId: input.householdId ?? null,
      status: 'failed',
      estimatedCostUsd: cost,
      promptTokens: 0,
      completionTokens: 0,
      model: null,
      intent,
    });
    if (e instanceof SchemaViolationError) {
      return {
        ok: false,
        code: 'schema_violation',
        message: 'The chef model returned an invalid response. Please retry.',
        attemptId,
        details: { errors: e.errors.join(' | ') },
      };
    }
    if (e instanceof ModelError) {
      return {
        ok: false,
        code: 'model_error',
        message: 'The chef model failed. Please retry in a moment.',
        attemptId,
      };
    }
    safeLog('error', 'chef_internal', {
      attemptId,
      userId: input.userId,
      note: e instanceof Error ? e.message : 'unknown',
    });
    return {
      ok: false,
      code: 'internal',
      message: 'Unexpected chef error.',
      attemptId,
    };
  }

  const cost = estimateCostUsd(llmResult.usage, pricing);

  // 5. Hard safety gate (code, not prompt)
  const gate = enforceSafetyGate({
    model: llmResult.data,
    dietary,
    catalog: [
      ...catalog,
      // Pantry items also act as catalog refs for name scanning / resolution.
      ...pantry.map((p) => ({
        id: p.ingredientId,
        name: p.name,
        allergens: p.allergens ?? [],
        dietaryFlags: p.dietaryFlags ?? [],
      })),
    ],
    pantry,
  });

  if (!gate.allowed) {
    await deps.usage.createAttempt({
      id: attemptId,
      userId: input.userId,
      householdId: input.householdId ?? null,
      status: 'safety_blocked',
      estimatedCostUsd: cost,
      promptTokens: llmResult.usage.promptTokens,
      completionTokens: llmResult.usage.completionTokens,
      model: llmResult.model,
      intent,
    });
    safeLog('warn', 'chef_safety_blocked', {
      attemptId,
      userId: input.userId,
      violationCount: gate.violations.length,
      intent,
    });
    return {
      ok: false,
      code: 'safety_blocked',
      message:
        'That suggestion was blocked because it conflicts with your allergen or dietary restrictions. Unknown ingredients are never treated as safe.',
      attemptId,
      violations: gate.violations,
    };
  }

  await deps.usage.createAttempt({
    id: attemptId,
    userId: input.userId,
    householdId: input.householdId ?? null,
    status: 'ok',
    estimatedCostUsd: cost,
    promptTokens: llmResult.usage.promptTokens,
    completionTokens: llmResult.usage.completionTokens,
    model: llmResult.model,
    intent: gate.sanitized.intent || intent,
  });

  const grounded = groundPantry(
    gate.sanitized.groundedPantryIds,
    pantry,
  );
  const remaining = roundUsd(
    Math.max(0, budget.budgetUsd - (monthSnap.spentUsd + cost)),
  );

  const success: ChefSuccessResponse = {
    ok: true,
    attemptId,
    message: gate.sanitized.message,
    intent: gate.sanitized.intent || intent,
    groundedPantry: grounded,
    ...(gate.sanitized.substitutions
      ? { substitutions: gate.sanitized.substitutions }
      : {}),
    ...(gate.sanitized.recipe !== undefined
      ? { recipe: gate.sanitized.recipe }
      : {}),
    ...(gate.sanitized.suggestedPrompts
      ? { suggestedPrompts: gate.sanitized.suggestedPrompts }
      : {}),
    summary: {
      model: llmResult.model,
      promptTokens: llmResult.usage.promptTokens,
      completionTokens: llmResult.usage.completionTokens,
      estimatedCostUsd: cost,
      remainingBudgetUsd: remaining,
    },
  };
  return success;
}
