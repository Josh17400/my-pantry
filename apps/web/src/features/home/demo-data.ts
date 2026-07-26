/**
 * Dev / design-review dataset when no repository is wired (web companion).
 *
 * Built from track G fixture generators + seed catalog names so the home
 * screen can be reviewed against a realistic pantry without SQLite.
 */

import {
  bandConfidence,
  type Dimension,
} from '@larder/core';

import { DEFAULT_HOUSEHOLD_ID, DEFAULT_LOCATION_IDS } from '../../db/constants';
import { buildFixtureItems } from '../../db/fixtures';
import type {
  LocationRow,
  PantryItemView,
  RecipeDetail,
} from '../../db/types';
import {
  seedIngredients,
} from '../../../../../packages/core/src/seed/index.ts';
import type { Recipe } from '../../../../../packages/core/src/recipes/types.ts';

const nameById = new Map(seedIngredients.map((i) => [i.id, i.name] as const));

function titleCaseIngredient(id: string): string {
  return nameById.get(id) ?? id.replace(/-/g, ' ');
}

const DEMO_LOCATIONS: LocationRow[] = [
  {
    id: DEFAULT_LOCATION_IDS.fridge,
    householdId: DEFAULT_HOUSEHOLD_ID,
    name: 'Fridge',
    icon: 'fridge',
    tint: 'sky',
    parentId: null,
    sortOrder: 0,
  },
  {
    id: DEFAULT_LOCATION_IDS.pantry,
    householdId: DEFAULT_HOUSEHOLD_ID,
    name: 'Pantry',
    icon: 'pantry',
    tint: 'tan',
    parentId: null,
    sortOrder: 1,
  },
  {
    id: DEFAULT_LOCATION_IDS.aroundHouse,
    householdId: DEFAULT_HOUSEHOLD_ID,
    name: 'Around the House',
    icon: 'house',
    tint: 'cream',
    parentId: null,
    sortOrder: 2,
  },
  {
    id: DEFAULT_LOCATION_IDS.spices,
    householdId: DEFAULT_HOUSEHOLD_ID,
    name: 'Spices',
    icon: 'spice',
    tint: 'sage',
    parentId: DEFAULT_LOCATION_IDS.aroundHouse,
    sortOrder: 3,
  },
  {
    id: DEFAULT_LOCATION_IDS.teaCoffee,
    householdId: DEFAULT_HOUSEHOLD_ID,
    name: 'Tea & Coffee',
    icon: 'tea',
    tint: 'cream',
    parentId: DEFAULT_LOCATION_IDS.aroundHouse,
    sortOrder: 4,
  },
  {
    id: DEFAULT_LOCATION_IDS.baking,
    householdId: DEFAULT_HOUSEHOLD_ID,
    name: 'Baking',
    icon: 'baking',
    tint: 'tan',
    parentId: DEFAULT_LOCATION_IDS.aroundHouse,
    sortOrder: 5,
  },
  {
    id: DEFAULT_LOCATION_IDS.household,
    householdId: DEFAULT_HOUSEHOLD_ID,
    name: 'Household',
    icon: 'household',
    tint: 'sky',
    parentId: DEFAULT_LOCATION_IDS.aroundHouse,
    sortOrder: 6,
  },
];

const LOCATION_NAME: Record<string, string> = Object.fromEntries(
  DEMO_LOCATIONS.map((l) => [l.id, l.name]),
);

/**
 * Fixture recipes with full lines — mirrors track G generateDevFixtures recipes
 * (buildFixtureRecipes is not exported from db/fixtures).
 */
function demoRecipes(): RecipeDetail[] {
  const householdId = DEFAULT_HOUSEHOLD_ID;
  const now = new Date().toISOString();

  const base = (
    id: string,
    title: string,
    servings: number,
    prepMin: number,
    cookMin: number,
    tags: string[],
    ingredients: RecipeDetail['ingredients'],
    steps: RecipeDetail['steps'],
  ): RecipeDetail => ({
    id,
    householdId,
    title,
    servings,
    prepMin,
    cookMin,
    visibility: 'private',
    tags,
    imageUrl: null,
    updatedAt: now,
    yieldNote: null,
    authorId: null,
    forkedFrom: null,
    createdAt: now,
    ingredients,
    steps,
  });

  return [
    base(
      'fixture-recipe-garlic-pasta',
      'Garlic Butter Pasta',
      4,
      10,
      15,
      ['weeknight', 'pasta'],
      [
        {
          id: 'l1',
          sortOrder: 0,
          ingredientId: 'pasta-spaghetti',
          formId: 'pasta-spaghetti-bulk',
          rawText: '12 oz spaghetti',
          qty: 340,
          unit: 'g',
        },
        {
          id: 'l2',
          sortOrder: 1,
          ingredientId: 'butter',
          formId: 'butter-stick',
          rawText: '4 tbsp butter',
          qty: 56,
          unit: 'g',
        },
        {
          id: 'l3',
          sortOrder: 2,
          ingredientId: 'garlic',
          formId: 'garlic-clove',
          rawText: '4 cloves garlic',
          qty: 4,
          unit: 'each',
        },
        {
          id: 'l4',
          sortOrder: 3,
          ingredientId: 'parmesan',
          formId: 'parmesan-grated',
          rawText: '1/2 cup parmesan',
          qty: 50,
          unit: 'g',
        },
        {
          id: 'l5',
          sortOrder: 4,
          ingredientId: 'salt-kosher',
          formId: 'salt-kosher-bulk',
          rawText: 'salt to taste',
          qty: null,
          unit: null,
          nonQuantified: true,
        },
      ],
      [
        {
          id: 's1',
          sortOrder: 0,
          text: 'Boil pasta in salted water until al dente.',
          durationSec: 600,
        },
        {
          id: 's2',
          sortOrder: 1,
          text: 'Melt butter and sauté garlic until fragrant.',
          durationSec: 180,
        },
        {
          id: 's3',
          sortOrder: 2,
          text: 'Toss pasta with butter, garlic, and parmesan. Serve.',
        },
      ],
    ),
    base(
      'fixture-recipe-chicken-rice',
      'Simple Chicken & Rice',
      4,
      15,
      30,
      ['dinner', 'protein'],
      [
        {
          id: 'l1',
          sortOrder: 0,
          ingredientId: 'chicken-breast',
          formId: 'chicken-breast-bulk',
          rawText: '1 lb chicken breast',
          qty: 454,
          unit: 'g',
        },
        {
          id: 'l2',
          sortOrder: 1,
          ingredientId: 'rice-white',
          formId: 'rice-white-bulk',
          rawText: '1.5 cups rice',
          qty: 280,
          unit: 'g',
        },
        {
          id: 'l3',
          sortOrder: 2,
          ingredientId: 'onion',
          formId: 'onion-whole',
          rawText: '1 onion',
          qty: 1,
          unit: 'each',
        },
        {
          id: 'l4',
          sortOrder: 3,
          ingredientId: 'broth-chicken',
          formId: 'broth-chicken-bulk',
          rawText: '2 cups broth',
          qty: 480,
          unit: 'ml',
        },
        {
          id: 'l5',
          sortOrder: 4,
          ingredientId: 'oil-olive',
          formId: 'oil-olive-liquid',
          rawText: '1 tbsp olive oil',
          qty: 15,
          unit: 'ml',
        },
      ],
      [
        { id: 's1', sortOrder: 0, text: 'Season and sear chicken in oil; set aside.' },
        { id: 's2', sortOrder: 1, text: 'Sauté onion, add rice and broth; simmer.' },
        {
          id: 's3',
          sortOrder: 2,
          text: 'Nestle chicken back in; cook until rice is tender.',
        },
      ],
    ),
    base(
      'fixture-recipe-spinach-eggs',
      'Spinach Scramble',
      2,
      5,
      8,
      ['breakfast', 'quick'],
      [
        {
          id: 'l1',
          sortOrder: 0,
          ingredientId: 'egg',
          formId: 'egg-whole',
          rawText: '4 eggs',
          qty: 4,
          unit: 'each',
        },
        {
          id: 'l2',
          sortOrder: 1,
          ingredientId: 'spinach',
          formId: 'spinach-bulk',
          rawText: '2 cups spinach',
          qty: 60,
          unit: 'g',
        },
        {
          id: 'l3',
          sortOrder: 2,
          ingredientId: 'butter',
          formId: 'butter-stick',
          rawText: '1 tbsp butter',
          qty: 14,
          unit: 'g',
        },
        {
          id: 'l4',
          sortOrder: 3,
          ingredientId: 'cheddar',
          formId: 'cheddar-block',
          rawText: 'handful cheddar',
          qty: 40,
          unit: 'g',
          optional: true,
        },
      ],
      [
        { id: 's1', sortOrder: 0, text: 'Wilt spinach in butter.' },
        {
          id: 's2',
          sortOrder: 1,
          text: 'Add beaten eggs; scramble soft. Fold in cheese if using.',
        },
      ],
    ),
    base(
      'fixture-recipe-black-bean-tacos',
      'Black Bean Tacos',
      4,
      10,
      15,
      ['vegetarian', 'weeknight'],
      [
        {
          id: 'l1',
          sortOrder: 0,
          ingredientId: 'beans-black',
          formId: 'beans-black-bulk',
          rawText: '1 can black beans',
          qty: 425,
          unit: 'g',
        },
        {
          id: 'l2',
          sortOrder: 1,
          ingredientId: 'cumin',
          formId: 'cumin-bulk',
          rawText: '1 tsp cumin',
          qty: 2,
          unit: 'g',
        },
        {
          id: 'l3',
          sortOrder: 2,
          ingredientId: 'onion',
          formId: 'onion-whole',
          rawText: '1/2 onion',
          qty: 0.5,
          unit: 'each',
        },
        {
          id: 'l4',
          sortOrder: 3,
          ingredientId: 'garlic',
          formId: 'garlic-clove',
          rawText: '2 cloves garlic',
          qty: 2,
          unit: 'each',
        },
      ],
      [
        {
          id: 's1',
          sortOrder: 0,
          text: 'Sauté onion and garlic; add beans and cumin.',
        },
        {
          id: 's2',
          sortOrder: 1,
          text: 'Mash lightly; serve in tortillas with toppings.',
        },
      ],
    ),
    // Extra fully-cookable variety for banner count
    base(
      'demo-recipe-olive-oil-pasta',
      'Olive Oil Spaghetti',
      2,
      5,
      12,
      ['weeknight', 'pasta'],
      [
        {
          id: 'l1',
          sortOrder: 0,
          ingredientId: 'pasta-spaghetti',
          formId: 'pasta-spaghetti-bulk',
          rawText: '8 oz spaghetti',
          qty: 225,
          unit: 'g',
        },
        {
          id: 'l2',
          sortOrder: 1,
          ingredientId: 'oil-olive',
          formId: 'oil-olive-liquid',
          rawText: '3 tbsp olive oil',
          qty: 45,
          unit: 'ml',
        },
        {
          id: 'l3',
          sortOrder: 2,
          ingredientId: 'garlic',
          formId: 'garlic-clove',
          rawText: '3 cloves garlic',
          qty: 3,
          unit: 'each',
        },
      ],
      [{ id: 's1', sortOrder: 0, text: 'Boil pasta; toss with warm oil and garlic.' }],
    ),
    base(
      'demo-recipe-rice-bowl',
      'Garlic Rice Bowl',
      2,
      5,
      20,
      ['side'],
      [
        {
          id: 'l1',
          sortOrder: 0,
          ingredientId: 'rice-white',
          formId: 'rice-white-bulk',
          rawText: '1 cup rice',
          qty: 185,
          unit: 'g',
        },
        {
          id: 'l2',
          sortOrder: 1,
          ingredientId: 'garlic',
          formId: 'garlic-clove',
          rawText: '2 cloves garlic',
          qty: 2,
          unit: 'each',
        },
        {
          id: 'l3',
          sortOrder: 2,
          ingredientId: 'oil-olive',
          formId: 'oil-olive-liquid',
          rawText: '1 tbsp oil',
          qty: 15,
          unit: 'ml',
        },
      ],
      [{ id: 's1', sortOrder: 0, text: 'Cook rice; finish with garlic oil.' }],
    ),
  ];
}

function fixturePantryViews(): PantryItemView[] {
  const now = new Date().toISOString();
  const items = buildFixtureItems();

  // Inject a couple of drifted items so provenance is visible on the home rails
  const drifted = new Set(['flour-ap', 'oil-olive']);

  return items.map((item) => {
    const isDrifted = drifted.has(item.ingredientId);
    const lastVerifiedAt = isDrifted
      ? new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      : now;
    const unverifiedCookCount = isDrifted ? 3 : 0;
    // Confidence computed for potential future display; store raw fields only
    void bandConfidence(lastVerifiedAt, unverifiedCookCount);

    return {
      householdId: DEFAULT_HOUSEHOLD_ID,
      ingredientId: item.ingredientId,
      formId: item.formId,
      locationId: item.locationId,
      qtyBase: item.qtyBase,
      dim: item.dim as Dimension,
      parLevelBase: item.parLevelBase,
      lowThresholdPct: item.lowThresholdPct ?? 0.25,
      lastVerifiedAt,
      unverifiedCookCount,
      openedAt: item.openedAt ?? null,
      expiresAt: item.expiresAt ?? null,
      updatedAt: now,
      watermarkCursor: null,
      lastAbsoluteCursor: null,
      isNegative: item.qtyBase < 0,
      conflict: false,
      ingredientName: titleCaseIngredient(item.ingredientId),
      formName: item.formId.split('-').slice(-1)[0] ?? null,
      locationName: LOCATION_NAME[item.locationId] ?? null,
    };
  });
}

export type DemoHomeData = {
  items: PantryItemView[];
  locations: LocationRow[];
  recipes: Recipe[];
  source: 'demo-fixtures';
};

export function loadDemoHomeData(): DemoHomeData {
  const details = demoRecipes();
  const recipes: Recipe[] = details.map((d) => ({
    id: d.id,
    householdId: d.householdId ?? undefined,
    title: d.title,
    servings: d.servings,
    prepMin: d.prepMin ?? undefined,
    cookMin: d.cookMin ?? undefined,
    tags: d.tags,
    imageUrl: d.imageUrl ?? undefined,
    ingredients: d.ingredients.map((line) => ({
      ingredientId: line.ingredientId,
      formId: line.formId,
      rawText: line.rawText,
      qty: line.qty ?? null,
      unit: line.unit ?? null,
      optional: line.optional,
      group: line.group,
      substitutes: line.substitutes,
      unknownAllergens: line.unknownAllergens,
      nonQuantified: line.nonQuantified,
      qtyHigh: line.qtyHigh,
      qtyLow: line.qtyLow,
      isRange: line.isRange,
    })),
    steps: d.steps.map((s) => ({
      text: s.text,
      durationSec: s.durationSec,
      timerLabel: s.timerLabel,
    })),
  }));

  return {
    items: fixturePantryViews(),
    locations: DEMO_LOCATIONS,
    recipes,
    source: 'demo-fixtures',
  };
}

export { DEMO_LOCATIONS };
