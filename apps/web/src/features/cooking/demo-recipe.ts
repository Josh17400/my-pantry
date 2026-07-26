/**
 * Demo recipe for cooking-mode review when the data layer is offline
 * or for deterministic screenshots (`?demo=1`).
 */

import type { Recipe } from '../../../../../packages/core/src/recipes/types.ts';

export const DEMO_COOKING_RECIPE: Recipe = {
  id: 'demo-cooking-garlic-pasta',
  title: 'Garlic Butter Pasta',
  servings: 4,
  prepMin: 10,
  cookMin: 15,
  ingredients: [
    {
      ingredientId: 'pasta-spaghetti',
      formId: 'pasta-spaghetti-bulk',
      rawText: '12 oz spaghetti',
      qty: 340,
      unit: 'g',
    },
    {
      ingredientId: 'butter',
      formId: 'butter-stick',
      rawText: '4 tbsp butter',
      qty: 56,
      unit: 'g',
    },
    {
      ingredientId: 'garlic',
      formId: 'garlic-clove',
      rawText: '4 cloves garlic',
      qty: 4,
      unit: 'each',
    },
    {
      ingredientId: 'parmesan',
      formId: 'parmesan-grated',
      rawText: '1/2 cup parmesan',
      qty: 50,
      unit: 'g',
    },
    {
      ingredientId: 'salt-kosher',
      formId: 'salt-kosher-bulk',
      rawText: 'salt to taste',
      qty: null,
      unit: null,
      nonQuantified: true,
    },
  ],
  steps: [
    {
      text: 'Boil pasta in salted water until al dente.',
      durationSec: 600,
      timerLabel: 'Pasta boil',
    },
    {
      text: 'Melt butter and sauté garlic until fragrant.',
      durationSec: 180,
      timerLabel: 'Garlic butter',
    },
    {
      text: 'Toss pasta with butter, garlic, and parmesan. Serve.',
    },
  ],
};
