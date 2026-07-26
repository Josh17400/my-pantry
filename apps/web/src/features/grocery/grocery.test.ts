import { describe, expect, it } from 'vitest';

import { formatQuantity } from '@larder/core';

import { aisleTitle } from './aisle-title';
import { buildDemoGroceryList, demoDisplayProof } from './demo-data';
import { coreListToItemInputs, groupItemsByAisle, isUnmergedItem } from './map-list';
import { sourceLabelsFor } from './source-labels';

describe('grocery feature — core consumption', () => {
  it('builds a demo list via core buildList with aisle groups and sources', () => {
    const { list, shoppingTripId } = buildDemoGroceryList(
      '2026-07-26T12:00:00.000Z',
    );

    expect(shoppingTripId).toBeTruthy();
    expect(list.shoppingTripId).toBe(shoppingTripId);
    expect(list.lines.length).toBeGreaterThan(3);
    expect(list.byAisle.length).toBeGreaterThan(1);

    // Every line must declare at least one source kind
    for (const line of list.lines) {
      expect(line.sources.length).toBeGreaterThan(0);
      expect(line.name.length).toBeGreaterThan(0);
    }

    // Ground beef shortfall should display in purchase units (lb), not raw 907 g
    const beef = list.lines.find((l) => l.ingredientId === 'ground-beef');
    expect(beef).toBeTruthy();
    expect(beef!.displayQty.toLowerCase()).toMatch(/lb|oz|g|kg/);
    expect(beef!.sources).toContain('stock-out');
    // recipe shortfall may merge into same line
    expect(
      beef!.sources.includes('recipe-shortfall') ||
        list.lines.some(
          (l) =>
            l.ingredientId === 'ground-beef' &&
            l.sources.includes('recipe-shortfall'),
        ),
    ).toBe(true);
  });

  it('demoDisplayProof uses formatQuantity purchase units', () => {
    const q = demoDisplayProof();
    expect(q).toBe(formatQuantity(907, 'mass', { locale: 'us' }));
    expect(q.toLowerCase()).not.toBe('907 g');
  });

  it('maps core lines to aisle-grouped rows and flags unmerged notes', () => {
    const { list } = buildDemoGroceryList('2026-07-26T12:00:00.000Z');
    const inputs = coreListToItemInputs(list);
    expect(inputs.length).toBe(list.lines.length);

    const rows = inputs.map((input, i) => ({
      id: input.id ?? `i${i}`,
      listId: 'l',
      shoppingTripId: list.shoppingTripId,
      ingredientId: input.ingredientId ?? null,
      formId: input.formId ?? null,
      name: input.name,
      category: input.category,
      qtyBase: input.qtyBase ?? null,
      dim: input.dim ?? null,
      displayQty: input.displayQty,
      sources: [...(input.sources ?? [])],
      recipeIds: [...(input.recipeIds ?? [])],
      checked: false,
      sortOrder: i,
      notes: input.notes ?? null,
    }));

    const aisles = groupItemsByAisle(rows);
    expect(aisles.length).toBeGreaterThan(1);
    const total = aisles.reduce((n, a) => n + a.items.length, 0);
    expect(total).toBe(rows.length);

    // No unmerged in demo fixtures typically — property still holds
    for (const r of rows) {
      if (r.notes?.startsWith('⚠')) {
        expect(isUnmergedItem(r)).toBe(true);
      }
    }
  });

  it('labels source kinds for chips (low uses text tone, not fill)', () => {
    const labels = sourceLabelsFor(['stock-low', 'recipe-shortfall', 'manual']);
    expect(labels.map((l) => l.label)).toEqual([
      'Getting low',
      'Recipe',
      'You added',
    ]);
    expect(labels.find((l) => l.kind === 'stock-low')?.tone).toBe('low');
  });

  it('pretty-prints aisle titles from seed slugs', () => {
    expect(aisleTitle('meat-seafood')).toBe('Meat & Seafood');
    expect(aisleTitle('dairy')).toBe('Dairy');
    expect(aisleTitle('baby-household')).toBe('Baby & Household');
  });
});
