import { describe, expect, it } from 'vitest';
import { findCookableRecipes } from '../../src/recipes';
import {
  ALL_FORMS,
  flourForm,
  garlicClove,
  line,
  recipe,
  spinachForm,
  stock,
} from './helpers';

const NOW = '2024-06-15T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);

describe('findCookableRecipes ranking', () => {
  const forms = ALL_FORMS;

  it('ranks fully-cookable first, then fewest missing', () => {
    const full = recipe('r-full', 'Full meal', 2, [
      line({
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        rawText: '100 g flour',
        qty: 100,
        unit: 'g',
      }),
    ]);
    const missingOne = recipe('r-miss1', 'Almost', 2, [
      line({
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        rawText: '100 g flour',
        qty: 100,
        unit: 'g',
      }),
      line({
        ingredientId: 'ing-egg',
        formId: 'form-egg-whole',
        rawText: '2 eggs',
        qty: 2,
        unit: 'each',
      }),
    ]);
    const missingTwo = recipe('r-miss2', 'Need more', 2, [
      line({
        ingredientId: 'ing-egg',
        formId: 'form-egg-whole',
        rawText: '2 eggs',
        qty: 2,
        unit: 'each',
      }),
      line({
        ingredientId: 'ing-milk',
        formId: 'form-milk-liquid',
        rawText: '1 cup milk',
        qty: 1,
        unit: 'cup',
      }),
      line({
        ingredientId: 'ing-butter',
        formId: 'form-butter',
        rawText: '50 g butter',
        qty: 50,
        unit: 'g',
      }),
    ]);

    const pantry = [stock('ing-flour', flourForm.id, 500, 'mass')];

    // Intentionally reverse input order
    const ranked = findCookableRecipes([missingTwo, full, missingOne], pantry, {
      forms,
      now: NOW,
    });

    expect(ranked.map((m) => m.recipe.id)).toEqual([
      'r-full',
      'r-miss1',
      'r-miss2',
    ]);
    expect(ranked[0]!.fullyCookable).toBe(true);
    expect(ranked[0]!.missingCount).toBe(0);
    expect(ranked[1]!.missingCount).toBe(1);
    expect(ranked[2]!.missingCount).toBe(3);
  });

  it('expiry-driven ordering: more use-up ingredients ranks higher on ties', () => {
    const withSpinach = recipe('r-spin', 'Spinach pasta', 2, [
      line({
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        rawText: '100 g flour',
        qty: 100,
        unit: 'g',
      }),
      line({
        ingredientId: 'ing-spinach',
        formId: spinachForm.id,
        rawText: '100 g spinach',
        qty: 100,
        unit: 'g',
      }),
    ]);
    const withGarlic = recipe('r-gar', 'Garlic bread', 2, [
      line({
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        rawText: '100 g flour',
        qty: 100,
        unit: 'g',
      }),
      line({
        ingredientId: 'ing-garlic',
        formId: garlicClove.id,
        rawText: '2 cloves',
        qty: 2,
        unit: 'each',
      }),
    ]);
    const plain = recipe('r-plain', 'Plain dough', 2, [
      line({
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        rawText: '100 g flour',
        qty: 100,
        unit: 'g',
      }),
    ]);

    const expiresSoon = new Date(NOW_MS + 2 * 24 * 60 * 60 * 1000).toISOString();
    const pantry = [
      stock('ing-flour', flourForm.id, 1000, 'mass'),
      stock('ing-spinach', spinachForm.id, 200, 'mass', expiresSoon),
      stock('ing-garlic', garlicClove.id, 10, 'count', expiresSoon),
    ];

    const ranked = findCookableRecipes([plain, withSpinach, withGarlic], pantry, {
      forms,
      now: NOW,
      expiryHorizonMs: 7 * 24 * 60 * 60 * 1000,
    });

    // All fully cookable; recipes with use-up ingredients first
    expect(ranked.every((m) => m.fullyCookable)).toBe(true);
    expect(ranked[0]!.useUpCount).toBeGreaterThan(0);
    expect(ranked[1]!.useUpCount).toBeGreaterThan(0);
    expect(ranked[2]!.recipe.id).toBe('r-plain');
    expect(ranked[2]!.useUpCount).toBe(0);

    // use-up lists include the expiring ingredients
    const spin = ranked.find((m) => m.recipe.id === 'r-spin')!;
    expect(spin.useUp.map((u) => u.ingredientId)).toContain('ing-spinach');
  });

  it('deterministic ties: same missing and useUp → recipe.id order', () => {
    const a = recipe('aaa', 'A', 1, [
      line({
        ingredientId: 'ing-egg',
        formId: 'form-egg-whole',
        rawText: '1 egg',
        qty: 1,
        unit: 'each',
      }),
    ]);
    const b = recipe('zzz', 'Z', 1, [
      line({
        ingredientId: 'ing-egg',
        formId: 'form-egg-whole',
        rawText: '1 egg',
        qty: 1,
        unit: 'each',
      }),
    ]);
    // Empty pantry — both missing 1, no use-up
    const ranked = findCookableRecipes([b, a], [], { forms, now: NOW });
    expect(ranked.map((m) => m.recipe.id)).toEqual(['aaa', 'zzz']);
  });

  it('respects limit', () => {
    const recipes = Array.from({ length: 5 }, (_, i) =>
      recipe(`r${i}`, `R${i}`, 1, [
        line({
          ingredientId: 'ing-flour',
          formId: flourForm.id,
          rawText: '1 g',
          qty: 1,
          unit: 'g',
        }),
      ]),
    );
    const pantry = [stock('ing-flour', flourForm.id, 100, 'mass')];
    const ranked = findCookableRecipes(recipes, pantry, {
      forms,
      now: NOW,
      limit: 2,
    });
    expect(ranked).toHaveLength(2);
  });
});

describe('findCookableRecipes performance', () => {
  it('stays responsive for 2000 recipes × 500 pantry items', () => {
    // 500 pantry items across ~50 ingredients
    const pantry = [];
    for (let i = 0; i < 500; i++) {
      const ing = `ing-${i % 50}`;
      pantry.push(
        stock(ing, `form-${ing}`, 1000, 'mass', i < 20 ? NOW : null),
      );
    }

    // 2000 recipes, ~8 lines each, ingredients drawn from pantry set
    const recipes = [];
    for (let r = 0; r < 2000; r++) {
      const lines = [];
      for (let L = 0; L < 8; L++) {
        const ing = `ing-${(r + L) % 50}`;
        lines.push(
          line({
            ingredientId: ing,
            formId: `form-${ing}`,
            rawText: `${10 + L} g`,
            qty: 10 + L,
            unit: 'g',
          }),
        );
      }
      recipes.push(recipe(`recipe-${r}`, `Recipe ${r}`, 2, lines));
    }

    // Forms needed for conversion (mass, same form id pattern)
    const bigForms = Array.from({ length: 50 }, (_, i) => ({
      id: `form-ing-${i}`,
      ingredientId: `ing-${i}`,
      form: 'bulk',
      dim: 'mass' as const,
      uncertaintyPct: 0,
    }));

    const t0 = performance.now();
    const ranked = findCookableRecipes(recipes, pantry, {
      forms: bigForms,
      now: NOW,
    });
    const ms = performance.now() - t0;

    expect(ranked).toHaveLength(2000);
    // Sane bound for pure TS on a dev machine — index-based should be << 5s
    // Use a generous bound so CI flakiness doesn't fail correctness; still
    // catches accidental O(R×L×P) regressions (which would be tens of seconds).
    expect(ms).toBeLessThan(5000);
    // Log for report visibility when running tests
    // eslint-disable-next-line no-console
    console.log(`cook-now 2000×500 completed in ${ms.toFixed(1)}ms`);
  });
});
