/**
 * Demo grocery sources when no native repository is active (web companion /
 * screenshot). Mirrors track G fixture stock levels so the list looks real.
 */

import {
  evaluateStock,
  formatQuantity,
  type Dimension,
} from '@larder/core';

import {
  seedEdges,
  seedForms,
  seedIngredients,
} from '../../../../../packages/core/src/seed/index.ts';

import {
  buildList,
  manualSource,
  sourcesFromReorder,
  sourcesFromStock,
  type GroceryList,
  type GrocerySource,
  type ReorderSuggestion,
  type StockGroceryInput,
} from './core-grocery';

type DemoStock = {
  ingredientId: string;
  formId: string;
  name: string;
  category: string;
  qtyBase: number;
  parLevelBase: number;
  lowThresholdPct: number;
  dim: Dimension;
};

/** Fixture-aligned stock for demo (subset of track G fixtures). Categories = seed slugs. */
const DEMO_STOCK: readonly DemoStock[] = [
  {
    ingredientId: 'milk',
    formId: 'milk-liquid',
    name: 'Milk (whole)',
    category: 'dairy',
    qtyBase: 500,
    parLevelBase: 1000,
    lowThresholdPct: 0.25,
    dim: 'volume',
  },
  {
    ingredientId: 'yogurt-plain',
    formId: 'yogurt-plain-bulk',
    name: 'Plain yogurt',
    category: 'dairy',
    qtyBase: 0,
    parLevelBase: 500,
    lowThresholdPct: 0.25,
    dim: 'mass',
  },
  {
    ingredientId: 'ground-beef',
    formId: 'ground-beef-bulk',
    name: 'Ground beef',
    category: 'meat-seafood',
    qtyBase: 0,
    parLevelBase: 454,
    lowThresholdPct: 0.25,
    dim: 'mass',
  },
  {
    ingredientId: 'sugar-granulated',
    formId: 'sugar-granulated-bulk',
    name: 'Granulated sugar',
    category: 'baking',
    qtyBase: 400,
    parLevelBase: 1800,
    lowThresholdPct: 0.3,
    dim: 'mass',
  },
  {
    ingredientId: 'oil-canola',
    formId: 'oil-canola-liquid',
    name: 'Canola oil',
    category: 'oils-vinegars',
    qtyBase: 50,
    parLevelBase: 1000,
    lowThresholdPct: 0.25,
    dim: 'volume',
  },
  {
    ingredientId: 'egg',
    formId: 'egg-whole',
    name: 'Eggs',
    category: 'dairy',
    qtyBase: 6,
    parLevelBase: 12,
    lowThresholdPct: 0.25,
    dim: 'count',
  },
  {
    ingredientId: 'spinach',
    formId: 'spinach-bulk',
    name: 'Spinach',
    category: 'produce',
    qtyBase: 100,
    parLevelBase: 280,
    lowThresholdPct: 0.25,
    dim: 'mass',
  },
  {
    ingredientId: 'granola-bar',
    formId: 'granola-bar-bulk',
    name: 'Granola bars',
    category: 'baby-household',
    qtyBase: 4,
    parLevelBase: 12,
    lowThresholdPct: 0.4,
    dim: 'mass',
  },
];

function stockSources(): GrocerySource[] {
  const stock: StockGroceryInput[] = DEMO_STOCK.map((item) => ({
    ingredientId: item.ingredientId,
    formId: item.formId,
    name: item.name,
    category: item.category,
    dim: item.dim,
    evaluation: evaluateStock(item.qtyBase, item.parLevelBase, {
      lowThresholdPct: item.lowThresholdPct,
    }),
  }));
  return sourcesFromStock(stock);
}

function recipeSources(): GrocerySource[] {
  return [
    {
      kind: 'recipe-shortfall',
      ingredientId: 'ground-beef',
      formId: 'ground-beef-bulk',
      name: 'Ground beef',
      category: 'meat-seafood',
      qtyBase: 907, // 2 lb — recipe shortfall on top of out-of-stock
      dim: 'mass',
      recipeId: 'fixture-recipe-black-bean-tacos',
      recipeTitle: 'Weeknight tacos',
      note: 'For Weeknight tacos',
    },
    {
      kind: 'recipe-shortfall',
      ingredientId: 'parmesan',
      formId: 'parmesan-grated',
      name: 'Parmesan',
      category: 'dairy',
      qtyBase: 50,
      dim: 'mass',
      recipeId: 'fixture-recipe-garlic-pasta',
      recipeTitle: 'Garlic Butter Pasta',
      note: 'For Garlic Butter Pasta',
    },
  ];
}

function manualSources(): GrocerySource[] {
  return [
    manualSource({
      name: 'Paper towels',
      category: 'baby-household',
      qty: 1,
      unit: 'each',
      note: 'Running low at home',
    }),
  ];
}

/** Bread is ok stock but overdue on cadence — pure reorder suggestion. */
function reorderOnly(): ReorderSuggestion[] {
  return [
    {
      ingredientId: 'bread-sandwich',
      formId: 'bread-sandwich-slice',
      name: 'Sandwich bread',
      category: 'grains-pasta',
      suggestedQtyBase: 20, // loaf ~20 slices
      dim: 'count',
      cadenceDays: 5,
      note: 'You usually buy every 5 days — last bought 6 days ago',
    },
  ];
}

export type DemoBuildResult = {
  list: GroceryList;
  shoppingTripId: string;
  reorderNotes: readonly { ingredientId: string; note: string }[];
};

/**
 * Build a full aisle-grouped demo list via core buildList (not a hand-rolled UI merge).
 */
export function buildDemoGroceryList(
  now = new Date().toISOString(),
): DemoBuildResult {
  const shoppingTripId = 'trip-demo-fixture';
  const reorder = reorderOnly();

  const sources: GrocerySource[] = [
    ...stockSources(),
    ...sourcesFromReorder(reorder),
    ...recipeSources(),
    ...manualSources(),
  ];

  const ingredients = seedIngredients.map((ing) => ({
    id: ing.id,
    name: ing.name,
    category: ing.category,
    allergens: ing.allergens,
    dietaryFlags: ing.dietaryFlags,
    isStaple: ing.isStaple,
    defaultFormId: ing.defaultFormId,
  }));

  const list = buildList({
    sources,
    shoppingTripId,
    now,
    forms: seedForms,
    edges: seedEdges,
    ingredients,
    locale: 'us',
  });

  return {
    list,
    shoppingTripId,
    reorderNotes: reorder.map((r) => ({
      ingredientId: r.ingredientId,
      note: r.note ?? '',
    })),
  };
}

export function demoDisplayProof(): string {
  return formatQuantity(907, 'mass', { locale: 'us' });
}
