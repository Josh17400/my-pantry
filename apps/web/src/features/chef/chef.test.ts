import { describe, expect, it } from 'vitest';
import {
  buildCatalogSlice,
  buildPantrySnapshot,
} from './context';
import { fixtureChefClient } from './client';
import type { PantryItemView } from '../../db/types';
import { SUGGESTED_PROMPTS } from './types';

function item(
  over: Partial<PantryItemView> &
    Pick<PantryItemView, 'ingredientId' | 'ingredientName'>,
): PantryItemView {
  return {
    householdId: 'hh1',
    formId: `${over.ingredientId}-bulk`,
    locationId: 'pantry',
    qtyBase: over.qtyBase ?? 500,
    dim: over.dim ?? 'mass',
    parLevelBase: 1000,
    lowThresholdPct: 25,
    lastVerifiedAt: null,
    unverifiedCookCount: 0,
    openedAt: null,
    expiresAt: null,
    updatedAt: new Date().toISOString(),
    watermarkCursor: null,
    lastAbsoluteCursor: null,
    isNegative: false,
    conflict: false,
    formName: null,
    locationName: null,
    ...over,
  };
}

describe('chef context', () => {
  it('builds pantry snapshot only from positive stock', () => {
    const snap = buildPantrySnapshot([
      item({
        ingredientId: 'chicken-breast',
        ingredientName: 'Chicken breast',
        qtyBase: 400,
      }),
      item({
        ingredientId: 'rice-white',
        ingredientName: 'White rice',
        qtyBase: 0,
      }),
    ]);
    expect(snap).toHaveLength(1);
    expect(snap[0]!.ingredientId).toBe('chicken-breast');
  });

  it('catalog slice includes gluten-critical grains for safety scanning', () => {
    const snap = buildPantrySnapshot([
      item({
        ingredientId: 'chicken-breast',
        ingredientName: 'Chicken breast',
      }),
    ]);
    const catalog = buildCatalogSlice(snap);
    const ids = new Set(catalog.map((c) => c.id));
    expect(ids.has('chicken-breast')).toBe(true);
    expect(ids.has('barley')).toBe(true);
    expect(ids.has('flour-ap')).toBe(true);
    const barley = catalog.find((c) => c.id === 'barley');
    expect(barley?.dietaryFlags).toContain('gluten');
  });

  it('empty state has suggested prompts', () => {
    expect(SUGGESTED_PROMPTS.length).toBeGreaterThanOrEqual(3);
  });
});

describe('chef client fixture', () => {
  it('returns entitlement_required for free-tier simulation', async () => {
    const client = fixtureChefClient(async () => ({
      ok: false as const,
      code: 'entitlement_required' as const,
      message: 'AI Chef is a paid feature.',
      upgradeUrl: '/settings/upgrade',
    }));
    const res = await client.chat({
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('entitlement_required');
      expect(res.upgradeUrl).toBeTruthy();
    }
  });

  it('returns grounded pantry on success', async () => {
    const client = fixtureChefClient(async () => ({
      ok: true as const,
      attemptId: 'a1',
      message: 'Make rice and chicken.',
      intent: 'what_can_i_make' as const,
      groundedPantry: [
        { ingredientId: 'chicken-breast', name: 'Chicken breast' },
      ],
      summary: {
        model: 'fixture',
        promptTokens: 1,
        completionTokens: 1,
        estimatedCostUsd: 0.001,
        remainingBudgetUsd: 2.9,
      },
    }));
    const res = await client.chat({
      messages: [{ role: 'user', content: 'What can I make?' }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.groundedPantry[0]?.name).toBe('Chicken breast');
    }
  });
});
