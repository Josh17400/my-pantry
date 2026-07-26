import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { runChefChat } from '../lib/pipeline.ts';
import { FixtureChefClient } from '../lib/llm.ts';
import { InMemoryUsageStore } from '../lib/usage_store.ts';
import type { ModelChefResponse } from '../lib/types.ts';
import { DEFAULT_PRICING } from '../lib/types.ts';
import {
  parseJsonContent,
  validateModelChefResponse,
} from '../lib/schema.ts';

async function loadModel(name: string): Promise<ModelChefResponse> {
  const text = await Deno.readTextFile(
    new URL(`../fixtures/${name}`, import.meta.url),
  );
  const v = validateModelChefResponse(parseJsonContent(text));
  if (!v.ok) throw new Error(v.errors.join(','));
  return v.value;
}

const catalog = [
  {
    id: 'barley',
    name: 'Pearl barley',
    allergens: [] as const,
    dietaryFlags: ['gluten' as const],
  },
  {
    id: 'chicken-breast',
    name: 'Chicken breast',
    allergens: [] as const,
    dietaryFlags: [] as const,
  },
  {
    id: 'rice-white',
    name: 'White rice',
    allergens: [] as const,
    dietaryFlags: [] as const,
  },
];

Deno.test('pipeline: free user gets entitlement_required upsell (no model path)', async () => {
  const usage = new InMemoryUsageStore();
  let llmCalled = false;
  const result = await runChefChat(
    {
      llm: {
        async complete() {
          llmCalled = true;
          throw new Error('should not call model for free user');
        },
      },
      usage,
      isPaid: false,
      pricing: DEFAULT_PRICING,
      idFactory: () => 'attempt-free',
    },
    {
      userId: 'user-free',
      messages: [{ role: 'user', content: 'What can I make tonight?' }],
    },
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, 'entitlement_required');
    assertExists(result.upgradeUrl);
  }
  assertEquals(llmCalled, false);
});

Deno.test('pipeline: paid safe chat returns grounded pantry', async () => {
  const usage = new InMemoryUsageStore();
  const model = await loadModel('safe-chat.json');
  const result = await runChefChat(
    {
      llm: new FixtureChefClient(model),
      usage,
      isPaid: true,
      pricing: DEFAULT_PRICING,
      idFactory: () => 'attempt-safe',
    },
    {
      userId: 'user-paid',
      messages: [{ role: 'user', content: 'What can I make tonight?' }],
      intent: 'what_can_i_make',
      pantry: [
        { ingredientId: 'chicken-breast', name: 'Chicken breast', qtyBase: 500, dim: 'mass' },
        { ingredientId: 'rice-white', name: 'White rice', qtyBase: 1000, dim: 'mass' },
      ],
      dietary: { avoidAllergens: [], avoidDietaryFlags: ['gluten'] },
      catalog,
    },
  );
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.groundedPantry.length, 2);
    assertEquals(
      result.groundedPantry.map((g) => g.ingredientId).sort(),
      ['chicken-breast', 'rice-white'],
    );
    assertEquals(result.summary.estimatedCostUsd > 0, true);
  }
});

Deno.test('pipeline: REQUIRED — flagged gluten recipe blocked server-side', async () => {
  const usage = new InMemoryUsageStore();
  const model = await loadModel('unsafe-gluten-recipe.json');
  const result = await runChefChat(
    {
      llm: new FixtureChefClient(model),
      usage,
      isPaid: true,
      pricing: DEFAULT_PRICING,
      idFactory: () => 'attempt-block',
    },
    {
      userId: 'user-celiac',
      messages: [{ role: 'user', content: 'Generate a risotto recipe' }],
      intent: 'generate_recipe',
      dietary: { avoidAllergens: [], avoidDietaryFlags: ['gluten'] },
      catalog,
      pantry: [
        { ingredientId: 'chicken-breast', name: 'Chicken breast' },
      ],
    },
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, 'safety_blocked');
    assertEquals((result.violations?.length ?? 0) > 0, true);
  }
  const snap = await usage.getSnapshot('user-celiac');
  // Cost still recorded (model ran; gate is post-response).
  assertEquals(snap.spentUsd > 0, true);
});

Deno.test('pipeline: budget circuit breaker', async () => {
  const usage = new InMemoryUsageStore();
  // Already at the monthly dollar ceiling — next call must be refused.
  await usage.createAttempt({
    id: 'prior-1',
    userId: 'user-budget',
    householdId: null,
    status: 'ok',
    estimatedCostUsd: 3.0,
    promptTokens: 1000,
    completionTokens: 500,
    model: 'fixture',
    intent: 'chat',
  });
  const model = await loadModel('safe-chat.json');
  const result = await runChefChat(
    {
      llm: new FixtureChefClient(model),
      usage,
      isPaid: true,
      pricing: DEFAULT_PRICING,
      quota: { monthlyBudgetUsd: 3.0, rateLimitCount: 100, rateLimitWindowMs: 3_600_000 },
      idFactory: () => 'attempt-budget',
    },
    {
      userId: 'user-budget',
      messages: [{ role: 'user', content: 'Hello' }],
    },
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, 'budget_exceeded');
});

Deno.test('pipeline: rate limit', async () => {
  const usage = new InMemoryUsageStore();
  for (let i = 0; i < 5; i++) {
    await usage.createAttempt({
      id: `r-${i}`,
      userId: 'user-rate',
      householdId: null,
      status: 'ok',
      estimatedCostUsd: 0.01,
      promptTokens: 10,
      completionTokens: 10,
      model: 'fixture',
      intent: 'chat',
    });
  }
  const model = await loadModel('safe-chat.json');
  const result = await runChefChat(
    {
      llm: new FixtureChefClient(model),
      usage,
      isPaid: true,
      pricing: DEFAULT_PRICING,
      quota: {
        monthlyBudgetUsd: 10,
        rateLimitCount: 5,
        rateLimitWindowMs: 3_600_000,
      },
      idFactory: () => 'attempt-rate',
    },
    {
      userId: 'user-rate',
      messages: [{ role: 'user', content: 'Hi' }],
    },
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, 'rate_limited');
});
