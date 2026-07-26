import { describe, expect, it } from 'vitest';
import {
  buildList,
  purchaseQtyFromSource,
  sourcesFromPlanShortfalls,
  sourcesFromStock,
} from '../../src/grocery';
import { planCook } from '../../src/recipes';
import type { GrocerySource } from '../../src/grocery';
import {
  ALL_FORMS,
  flourForm,
  INGREDIENTS,
  line,
  recipe,
  stock,
} from '../recipes/helpers';

const NOW = '2024-06-15T12:00:00.000Z';
const TRIP = 'trip-test-001';

describe('purchaseQtyFromSource — ranges use high', () => {
  it('uses qtyHigh when isRange', () => {
    const q = purchaseQtyFromSource({
      kind: 'manual',
      qty: 2.5,
      unit: 'each',
      qtyLow: 2,
      qtyHigh: 3,
      isRange: true,
    });
    expect(q.qty).toBe(3);
  });

  it('prefers qtyBase when provided', () => {
    const q = purchaseQtyFromSource({
      kind: 'recipe-shortfall',
      qtyBase: 500,
      dim: 'mass',
      qty: 1,
      unit: 'lb',
    });
    expect(q.qtyBase).toBe(500);
    expect(q.dim).toBe('mass');
  });
});

describe('buildList aggregation', () => {
  it('merges same ingredient across recipes in mixed units into one line', () => {
    // Recipe A needs 200 g flour; recipe B needs 0.5 lb flour
    // 0.5 lb = 226.796185 g; total ≈ 426.796 g → display as lb or g
    const sources: GrocerySource[] = [
      {
        kind: 'recipe-shortfall',
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        name: 'All-purpose flour',
        category: 'Baking',
        qty: 200,
        unit: 'g',
        recipeId: 'r-a',
      },
      {
        kind: 'recipe-shortfall',
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        name: 'All-purpose flour',
        category: 'Baking',
        qty: 0.5,
        unit: 'lb',
        recipeId: 'r-b',
      },
    ];

    const list = buildList({
      sources,
      shoppingTripId: TRIP,
      now: NOW,
      forms: ALL_FORMS,
      ingredients: INGREDIENTS,
    });

    const flourLines = list.lines.filter((l) => l.ingredientId === 'ing-flour');
    expect(flourLines).toHaveLength(1);
    const line0 = flourLines[0]!;
    expect(line0.unmerged).toBe(false);
    expect(line0.qtyBase).toBeCloseTo(200 + 0.5 * 453.59237, 5);
    expect(line0.dim).toBe('mass');
    expect([...line0.recipeIds].sort()).toEqual(['r-a', 'r-b']);
    // Display in purchase units — not raw "426.79 g" forced; formatQuantity picks readable unit
    expect(line0.displayQty).toMatch(/\d/);
    expect(line0.displayQty.toLowerCase()).toMatch(/oz|lb|g|kg/);
    // Should not be a raw gram dump of many decimals only without unit choice
    expect(line0.displayQty).not.toMatch(/^907/);
  });

  it('keeps non-convertible pair separate and flags unmerged', () => {
    // Same ingredient, incompatible forms with no edge: count cloves vs volume minced
    const sources: GrocerySource[] = [
      {
        kind: 'recipe-shortfall',
        ingredientId: 'ing-garlic',
        formId: 'form-garlic-clove',
        name: 'Garlic',
        category: 'Produce',
        qtyBase: 6,
        dim: 'count',
        recipeId: 'r1',
      },
      {
        kind: 'recipe-shortfall',
        ingredientId: 'ing-garlic',
        formId: 'form-garlic-minced',
        name: 'Garlic',
        category: 'Produce',
        qtyBase: 30,
        dim: 'volume',
        recipeId: 'r2',
      },
    ];

    const list = buildList({
      sources,
      shoppingTripId: TRIP,
      now: NOW,
      forms: ALL_FORMS,
      edges: [], // no conversion path
      ingredients: INGREDIENTS,
    });

    const garlic = list.lines.filter((l) => l.ingredientId === 'ing-garlic');
    expect(garlic.length).toBeGreaterThanOrEqual(2);
    expect(garlic.every((l) => l.unmerged)).toBe(true);
    expect(garlic.some((l) => l.unmergedReason)).toBe(true);
    // Totals not silently summed into one nonsense number
    const sumIfMerged = garlic.reduce((s, l) => s + (l.qtyBase ?? 0), 0);
    // Each line keeps its own qty
    expect(garlic.some((l) => l.qtyBase === 6)).toBe(true);
    expect(garlic.some((l) => l.qtyBase === 30)).toBe(true);
    expect(sumIfMerged).toBe(36); // separate lines, not one line of 36 mixed units
  });

  it('ranges use high for purchase quantity', () => {
    const list = buildList({
      sources: [
        {
          kind: 'manual',
          ingredientId: 'ing-garlic',
          formId: 'form-garlic-clove',
          name: 'Garlic',
          category: 'Produce',
          qty: 2.5,
          unit: 'each',
          qtyLow: 2,
          qtyHigh: 4,
          isRange: true,
        },
      ],
      shoppingTripId: TRIP,
      now: NOW,
      forms: ALL_FORMS,
      ingredients: INGREDIENTS,
    });
    expect(list.lines).toHaveLength(1);
    expect(list.lines[0]!.qtyBase).toBe(4);
  });

  it('displays in purchase units via formatQuantity (lb not only g)', () => {
    // ~2 lb of ground beef style mass
    const twoLbG = 2 * 453.59237;
    const list = buildList({
      sources: [
        {
          kind: 'manual',
          ingredientId: 'ing-flour',
          formId: flourForm.id,
          name: 'Ground beef',
          category: 'Meat',
          qtyBase: twoLbG,
          dim: 'mass',
        },
      ],
      shoppingTripId: TRIP,
      now: NOW,
      forms: ALL_FORMS,
    });
    expect(list.lines[0]!.displayQty).toMatch(/2\s*lb/i);
    expect(list.lines[0]!.displayQty).not.toMatch(/^907/);
  });

  it('groups by aisle using Ingredient.category', () => {
    const list = buildList({
      sources: [
        {
          kind: 'manual',
          ingredientId: 'ing-flour',
          qtyBase: 500,
          dim: 'mass',
        },
        {
          kind: 'manual',
          ingredientId: 'ing-spinach',
          qtyBase: 100,
          dim: 'mass',
        },
        {
          kind: 'manual',
          ingredientId: 'ing-milk',
          qtyBase: 1000,
          dim: 'volume',
        },
      ],
      shoppingTripId: TRIP,
      now: NOW,
      forms: ALL_FORMS,
      ingredients: INGREDIENTS,
    });

    const aisles = list.byAisle.map((a) => a.aisle);
    expect(aisles).toContain('Baking');
    expect(aisles).toContain('Produce');
    expect(aisles).toContain('Dairy');
    expect(list.shoppingTripId).toBe(TRIP);
    expect(list.createdAt).toBe(NOW);
  });

  it('merges manual + stock-low + recipe shortfall for same ingredient', () => {
    const sources: GrocerySource[] = [
      {
        kind: 'manual',
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        qtyBase: 100,
        dim: 'mass',
      },
      {
        kind: 'stock-low',
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        qtyBase: 400,
        dim: 'mass',
      },
      {
        kind: 'recipe-shortfall',
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        qty: 200,
        unit: 'g',
        recipeId: 'r1',
      },
    ];
    const list = buildList({
      sources,
      shoppingTripId: TRIP,
      now: NOW,
      forms: ALL_FORMS,
      ingredients: INGREDIENTS,
    });
    const flour = list.lines.filter((l) => l.ingredientId === 'ing-flour');
    expect(flour).toHaveLength(1);
    expect(flour[0]!.qtyBase).toBeCloseTo(700, 5);
    expect(flour[0]!.sources).toEqual(
      expect.arrayContaining(['manual', 'stock-low', 'recipe-shortfall']),
    );
  });

  it('carries shoppingTripId for later receipt reconciliation', () => {
    const list = buildList({
      sources: [],
      shoppingTripId: 'trip-abc',
      now: NOW,
    });
    expect(list.shoppingTripId).toBe('trip-abc');
  });
});

describe('sourcesFromStock / sourcesFromPlanShortfalls', () => {
  it('sourcesFromStock emits low and out only', () => {
    const src = sourcesFromStock([
      {
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        dim: 'mass',
        evaluation: {
          status: 'low',
          qtyBase: 100,
          parLevelBase: 1000,
          ratio: 0.1,
          lowThresholdPct: 0.25,
          needsNegativePrompt: false,
          isNegative: false,
        },
      },
      {
        ingredientId: 'ing-milk',
        formId: 'form-milk-liquid',
        dim: 'volume',
        evaluation: {
          status: 'ok',
          qtyBase: 2000,
          parLevelBase: 1000,
          ratio: 2,
          lowThresholdPct: 0.25,
          needsNegativePrompt: false,
          isNegative: false,
        },
      },
      {
        ingredientId: 'ing-egg',
        formId: 'form-egg-whole',
        dim: 'count',
        evaluation: {
          status: 'out',
          qtyBase: 0,
          parLevelBase: 12,
          ratio: 0,
          lowThresholdPct: 0.25,
          needsNegativePrompt: false,
          isNegative: false,
        },
      },
    ]);
    expect(src).toHaveLength(2);
    expect(src.map((s) => s.kind).sort()).toEqual(['stock-low', 'stock-out']);
  });

  it('sourcesFromPlanShortfalls uses shortfallBase from planCook', () => {
    const r = recipe('r1', 'Bread', 1, [
      line({
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        rawText: '500 g flour',
        qty: 500,
        unit: 'g',
      }),
    ]);
    const pantry = [stock('ing-flour', flourForm.id, 200, 'mass')];
    const plan = planCook(r, 1, pantry, { forms: ALL_FORMS });
    const src = sourcesFromPlanShortfalls('r1', plan, {
      recipeTitle: 'Bread',
      names: new Map([['ing-flour', 'All-purpose flour']]),
      categories: new Map([['ing-flour', 'Baking']]),
    });
    expect(src).toHaveLength(1);
    expect(src[0]!.kind).toBe('recipe-shortfall');
    expect(src[0]!.qtyBase).toBe(300);
    expect(src[0]!.dim).toBe('mass');
  });

  it('sourcesFromPlanShortfalls does not invent qty for not-convertible', () => {
    const r = recipe('r1', 'Garlic', 1, [
      line({
        ingredientId: 'ing-garlic',
        formId: 'form-garlic-clove',
        rawText: '3 cloves',
        qty: 3,
        unit: 'each',
      }),
    ]);
    const pantry = [stock('ing-garlic', 'form-garlic-minced', 30, 'volume')];
    const plan = planCook(r, 1, pantry, { forms: ALL_FORMS, edges: [] });
    expect(plan.lines[0]!.status).toBe('not-convertible');
    const src = sourcesFromPlanShortfalls('r1', plan);
    expect(src).toHaveLength(1);
    expect(src[0]!.qtyBase).toBeUndefined();
    expect(src[0]!.note).toMatch(/convertible/i);
  });
});
