/**
 * THE critical safety tests for the AI chef track.
 * A model response recommending a flagged ingredient must be blocked server-side.
 */

import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  enforceSafetyGate,
  hitsAvoidList,
} from '../lib/safety_gate.ts';
import type {
  CatalogIngredientRef,
  DietaryProfile,
  ModelChefResponse,
} from '../lib/types.ts';
import { validateModelChefResponse, parseJsonContent } from '../lib/schema.ts';

const catalog: CatalogIngredientRef[] = [
  {
    id: 'barley',
    name: 'Pearl barley',
    allergens: [],
    dietaryFlags: ['gluten'],
  },
  {
    id: 'chicken-breast',
    name: 'Chicken breast',
    allergens: [],
    dietaryFlags: [],
  },
  {
    id: 'flour-ap',
    name: 'All-purpose flour',
    allergens: ['wheat'],
    dietaryFlags: ['gluten'],
  },
  {
    id: 'rice-white',
    name: 'White rice',
    allergens: [],
    dietaryFlags: [],
  },
  {
    id: 'peanut-butter',
    name: 'Peanut butter',
    allergens: ['peanut'],
    dietaryFlags: [],
  },
  {
    id: 'coconut-milk',
    name: 'Coconut milk',
    allergens: ['tree_nut'],
    dietaryFlags: [],
  },
];

const glutenFreeUser: DietaryProfile = {
  avoidAllergens: [],
  avoidDietaryFlags: ['gluten'],
};

const peanutUser: DietaryProfile = {
  avoidAllergens: ['peanut'],
  avoidDietaryFlags: [],
};

async function loadFixture(name: string): Promise<ModelChefResponse> {
  const text = await Deno.readTextFile(
    new URL(`../fixtures/${name}`, import.meta.url),
  );
  const parsed = parseJsonContent(text);
  const v = validateModelChefResponse(parsed);
  if (!v.ok) throw new Error(v.errors.join(','));
  return v.value;
}

Deno.test('REQUIRED: model recipe with gluten-flagged barley is blocked for gluten-free user', async () => {
  const model = await loadFixture('unsafe-gluten-recipe.json');
  const result = enforceSafetyGate({
    model,
    dietary: glutenFreeUser,
    catalog,
    pantry: [],
  });
  assertEquals(result.allowed, false);
  assertEquals(result.violations.length > 0, true);
  assertEquals(
    result.violations.some(
      (v) =>
        v.kind === 'flagged_dietary' &&
        v.dietaryFlag === 'gluten',
    ),
    true,
  );
  assertEquals(result.sanitized.recipe, null);
});

Deno.test('REQUIRED: model free-text mentioning flour is blocked for gluten avoider', () => {
  const model: ModelChefResponse = {
    message:
      'Toss the chicken in all-purpose flour and pan-fry until golden.',
    intent: 'cooking_qa',
    groundedPantryIds: ['chicken-breast'],
  };
  const result = enforceSafetyGate({
    model,
    dietary: glutenFreeUser,
    catalog,
    pantry: [
      {
        ingredientId: 'chicken-breast',
        name: 'Chicken breast',
        allergens: [],
        dietaryFlags: [],
      },
    ],
  });
  assertEquals(result.allowed, false);
  assertExists(
    result.violations.find((v) => v.kind === 'flagged_dietary' || v.kind === 'flagged_allergen'),
  );
});

Deno.test('REQUIRED: unknownAllergens substitution is blocked', async () => {
  const model = await loadFixture('unsafe-unknown.json');
  const result = enforceSafetyGate({
    model,
    dietary: peanutUser,
    catalog,
    pantry: [],
  });
  assertEquals(result.allowed, false);
  assertEquals(
    result.violations.some((v) => v.kind === 'unknown_allergens'),
    true,
  );
});

Deno.test('safe chat response is allowed', async () => {
  const model = await loadFixture('safe-chat.json');
  const result = enforceSafetyGate({
    model,
    dietary: glutenFreeUser,
    catalog,
    pantry: [
      { ingredientId: 'chicken-breast', name: 'Chicken breast' },
      { ingredientId: 'rice-white', name: 'White rice' },
    ],
  });
  assertEquals(result.allowed, true);
  assertEquals(result.violations.length, 0);
});

Deno.test('peanut substitution blocked for peanut-allergic user', () => {
  const model: ModelChefResponse = {
    message: 'Use peanut butter instead of tahini.',
    intent: 'substitute',
    groundedPantryIds: [],
    substitutions: [
      {
        forIngredient: 'tahini',
        suggestion: 'peanut butter',
        ratio: '1:1',
        ingredientId: 'peanut-butter',
        allergens: ['peanut'],
        dietaryFlags: [],
        unknownAllergens: false,
      },
    ],
  };
  const result = enforceSafetyGate({
    model,
    dietary: peanutUser,
    catalog,
    pantry: [],
  });
  assertEquals(result.allowed, false);
  assertEquals(
    result.violations.some(
      (v) => v.kind === 'flagged_allergen' && v.allergen === 'peanut',
    ),
    true,
  );
});

Deno.test('hitsAvoidList treats unknown as unsafe', () => {
  assertEquals(
    hitsAvoidList({
      allergens: [],
      dietaryFlags: [],
      unknownAllergens: true,
      avoidAllergens: ['milk'],
      avoidDietaryFlags: [],
    }),
    true,
  );
  assertEquals(
    hitsAvoidList({
      allergens: [],
      dietaryFlags: ['gluten'],
      avoidAllergens: [],
      avoidDietaryFlags: ['gluten'],
    }),
    true,
  );
  assertEquals(
    hitsAvoidList({
      allergens: [],
      dietaryFlags: [],
      avoidAllergens: ['wheat'],
      avoidDietaryFlags: ['gluten'],
    }),
    false,
  );
});

Deno.test('safe coconut sub allowed when peanut avoided (not tree_nut)', async () => {
  const model = await loadFixture('safe-sub.json');
  const result = enforceSafetyGate({
    model,
    dietary: peanutUser,
    catalog,
    pantry: [],
  });
  assertEquals(result.allowed, true);
});

Deno.test('tree_nut avoider blocks coconut milk sub', async () => {
  const model = await loadFixture('safe-sub.json');
  const result = enforceSafetyGate({
    model,
    dietary: {
      avoidAllergens: ['tree_nut'],
      avoidDietaryFlags: [],
    },
    catalog,
    pantry: [],
  });
  assertEquals(result.allowed, false);
});
