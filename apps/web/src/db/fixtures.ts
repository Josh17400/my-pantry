/**
 * Dev-mode fixture generator — believable demo pantry + recipes.
 *
 * Screens and design review need non-empty data. Idempotent when
 * `app_meta.fixtures_version` already matches FIXTURES_VERSION.
 *
 * Ingredient / form ids match packages/core seed catalog (SEED_VERSION 1.0.0).
 */

import { DEFAULT_LOW_THRESHOLD_PCT } from '@larder/core';
import { eq } from 'drizzle-orm';

import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_LOCATION_IDS,
  DEFAULT_USER_ID,
  META_FIXTURES_VERSION,
} from './constants';
import type { AppDatabase, DomainRepository } from './domain-repository';
import { appMeta } from './schema';
import type { RecipeWrite } from './types';

export const FIXTURES_VERSION = '1.0.0' as const;

type FixtureItem = {
  ingredientId: string;
  formId: string;
  locationId: string;
  qtyBase: number;
  parLevelBase: number;
  lowThresholdPct?: number;
  expiresAt?: string | null;
  openedAt?: string | null;
  dim: 'mass' | 'volume' | 'count';
};

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/**
 * ~40 pantry rows across locations: some expiring soon, some low, some out.
 */
export function buildFixtureItems(): FixtureItem[] {
  const fridge = DEFAULT_LOCATION_IDS.fridge;
  const pantry = DEFAULT_LOCATION_IDS.pantry;
  const spices = DEFAULT_LOCATION_IDS.spices;
  const baking = DEFAULT_LOCATION_IDS.baking;
  const tea = DEFAULT_LOCATION_IDS.teaCoffee;
  const household = DEFAULT_LOCATION_IDS.household;

  return [
    // Fridge
    {
      ingredientId: 'milk',
      formId: 'milk-liquid',
      locationId: fridge,
      qtyBase: 500,
      parLevelBase: 1000,
      expiresAt: daysFromNow(2),
      openedAt: daysAgo(1),
      dim: 'volume',
    },
    {
      ingredientId: 'egg',
      formId: 'egg-whole',
      locationId: fridge,
      qtyBase: 6,
      parLevelBase: 12,
      expiresAt: daysFromNow(10),
      dim: 'count',
    },
    {
      ingredientId: 'butter',
      formId: 'butter-stick',
      locationId: fridge,
      qtyBase: 200,
      parLevelBase: 454,
      expiresAt: daysFromNow(20),
      dim: 'mass',
    },
    {
      ingredientId: 'cheddar',
      formId: 'cheddar-block',
      locationId: fridge,
      qtyBase: 150,
      parLevelBase: 226,
      expiresAt: daysFromNow(5),
      dim: 'mass',
    },
    {
      ingredientId: 'parmesan',
      formId: 'parmesan-grated',
      locationId: fridge,
      qtyBase: 80,
      parLevelBase: 200,
      expiresAt: daysFromNow(14),
      dim: 'mass',
    },
    {
      ingredientId: 'yogurt-plain',
      formId: 'yogurt-plain-bulk',
      locationId: fridge,
      qtyBase: 0,
      parLevelBase: 500,
      dim: 'mass',
    }, // OUT
    {
      ingredientId: 'spinach',
      formId: 'spinach-bulk',
      locationId: fridge,
      qtyBase: 100,
      parLevelBase: 280,
      expiresAt: daysFromNow(1),
      dim: 'mass',
    },
    {
      ingredientId: 'garlic',
      formId: 'garlic-clove',
      locationId: fridge,
      qtyBase: 8,
      parLevelBase: 12,
      expiresAt: daysFromNow(21),
      dim: 'count',
    },
    {
      ingredientId: 'lemon',
      formId: 'lemon-each',
      locationId: fridge,
      qtyBase: 2,
      parLevelBase: 4,
      expiresAt: daysFromNow(6),
      dim: 'count',
    },
    {
      ingredientId: 'chicken-breast',
      formId: 'chicken-breast-bulk',
      locationId: fridge,
      qtyBase: 450,
      parLevelBase: 900,
      expiresAt: daysFromNow(1),
      dim: 'mass',
    },
    {
      ingredientId: 'ground-beef',
      formId: 'ground-beef-bulk',
      locationId: fridge,
      qtyBase: 0,
      parLevelBase: 454,
      dim: 'mass',
    }, // OUT
    {
      ingredientId: 'bacon',
      formId: 'bacon-bulk',
      locationId: fridge,
      qtyBase: 200,
      parLevelBase: 454,
      expiresAt: daysFromNow(4),
      dim: 'mass',
    },
    {
      ingredientId: 'carrot',
      formId: 'carrot-bulk',
      locationId: fridge,
      qtyBase: 400,
      parLevelBase: 500,
      expiresAt: daysFromNow(8),
      dim: 'mass',
    },
    {
      ingredientId: 'celery',
      formId: 'celery-bulk',
      locationId: fridge,
      qtyBase: 200,
      parLevelBase: 400,
      expiresAt: daysFromNow(5),
      dim: 'mass',
    },

    // Pantry
    {
      ingredientId: 'onion',
      formId: 'onion-whole',
      locationId: pantry,
      qtyBase: 3,
      parLevelBase: 5,
      dim: 'count',
    },
    {
      ingredientId: 'flour-ap',
      formId: 'flour-ap-bulk',
      locationId: pantry,
      qtyBase: 1800,
      parLevelBase: 2268,
      dim: 'mass',
    },
    {
      ingredientId: 'sugar-granulated',
      formId: 'sugar-granulated-bulk',
      locationId: pantry,
      qtyBase: 400,
      parLevelBase: 1800,
      lowThresholdPct: 30,
      dim: 'mass',
    }, // LOW
    {
      ingredientId: 'rice-white',
      formId: 'rice-white-bulk',
      locationId: pantry,
      qtyBase: 1500,
      parLevelBase: 2000,
      dim: 'mass',
    },
    {
      ingredientId: 'pasta-spaghetti',
      formId: 'pasta-spaghetti-bulk',
      locationId: pantry,
      qtyBase: 450,
      parLevelBase: 450,
      dim: 'mass',
    },
    {
      ingredientId: 'oil-olive',
      formId: 'oil-olive-liquid',
      locationId: pantry,
      qtyBase: 400,
      parLevelBase: 750,
      openedAt: daysAgo(30),
      dim: 'volume',
    },
    {
      ingredientId: 'oil-canola',
      formId: 'oil-canola-liquid',
      locationId: pantry,
      qtyBase: 50,
      parLevelBase: 1000,
      lowThresholdPct: 25,
      dim: 'volume',
    }, // LOW
    {
      ingredientId: 'soy-sauce',
      formId: 'soy-sauce-liquid',
      locationId: pantry,
      qtyBase: 200,
      parLevelBase: 300,
      dim: 'volume',
    },
    {
      ingredientId: 'tomato-diced',
      formId: 'tomato-diced-bulk',
      locationId: pantry,
      qtyBase: 800,
      parLevelBase: 800,
      dim: 'mass',
    },
    {
      ingredientId: 'beans-black',
      formId: 'beans-black-bulk',
      locationId: pantry,
      qtyBase: 425,
      parLevelBase: 425,
      dim: 'mass',
    },
    {
      ingredientId: 'broth-chicken',
      formId: 'broth-chicken-bulk',
      locationId: pantry,
      qtyBase: 500,
      parLevelBase: 1000,
      dim: 'mass',
    },
    {
      ingredientId: 'bread-sandwich',
      formId: 'bread-sandwich-slice',
      locationId: pantry,
      qtyBase: 4,
      parLevelBase: 20,
      expiresAt: daysFromNow(1),
      lowThresholdPct: 30,
      dim: 'count',
    }, // LOW + expiring
    {
      ingredientId: 'peanut-butter',
      formId: 'peanut-butter-bulk',
      locationId: pantry,
      qtyBase: 300,
      parLevelBase: 454,
      dim: 'mass',
    },
    {
      ingredientId: 'honey',
      formId: 'honey-bulk',
      locationId: pantry,
      qtyBase: 250,
      parLevelBase: 340,
      dim: 'mass',
    },

    // Baking
    {
      ingredientId: 'sugar-brown',
      formId: 'sugar-brown-bulk',
      locationId: baking,
      qtyBase: 200,
      parLevelBase: 900,
      dim: 'mass',
    }, // LOW-ish
    {
      ingredientId: 'baking-soda',
      formId: 'baking-soda-bulk',
      locationId: baking,
      qtyBase: 200,
      parLevelBase: 454,
      dim: 'mass',
    },
    {
      ingredientId: 'baking-powder',
      formId: 'baking-powder-bulk',
      locationId: baking,
      qtyBase: 100,
      parLevelBase: 200,
      dim: 'mass',
    },

    // Spices
    {
      ingredientId: 'salt-kosher',
      formId: 'salt-kosher-bulk',
      locationId: spices,
      qtyBase: 500,
      parLevelBase: 500,
      dim: 'mass',
    },
    {
      ingredientId: 'pepper-black',
      formId: 'pepper-black-bulk',
      locationId: spices,
      qtyBase: 40,
      parLevelBase: 50,
      dim: 'mass',
    },
    {
      ingredientId: 'cumin',
      formId: 'cumin-bulk',
      locationId: spices,
      qtyBase: 20,
      parLevelBase: 40,
      dim: 'mass',
    },
    {
      ingredientId: 'paprika',
      formId: 'paprika-bulk',
      locationId: spices,
      qtyBase: 5,
      parLevelBase: 40,
      lowThresholdPct: 30,
      dim: 'mass',
    }, // LOW
    {
      ingredientId: 'cinnamon-ground',
      formId: 'cinnamon-ground-bulk',
      locationId: spices,
      qtyBase: 30,
      parLevelBase: 40,
      dim: 'mass',
    },
    {
      ingredientId: 'oregano-dried',
      formId: 'oregano-dried-bulk',
      locationId: spices,
      qtyBase: 15,
      parLevelBase: 20,
      dim: 'mass',
    },

    // Tea & coffee
    {
      ingredientId: 'coffee-grounds',
      formId: 'coffee-grounds-bulk',
      locationId: tea,
      qtyBase: 200,
      parLevelBase: 340,
      dim: 'mass',
    },
    {
      ingredientId: 'tea-bags',
      formId: 'tea-bags-bulk',
      locationId: tea,
      qtyBase: 20,
      parLevelBase: 40,
      dim: 'count',
    },

    // Around-the-house / household shelf (snack shelf demo)
    {
      ingredientId: 'granola-bar',
      formId: 'granola-bar-bulk',
      locationId: household,
      qtyBase: 4,
      parLevelBase: 12,
      lowThresholdPct: 40,
      dim: 'count',
    }, // LOW
  ];
}

/** Fixture recipes for dev seed (exported for the browser IndexedDB driver). */
export function buildFixtureRecipes(householdId: string): RecipeWrite[] {
  return [
    {
      id: 'fixture-recipe-garlic-pasta',
      householdId,
      title: 'Garlic Butter Pasta',
      servings: 4,
      prepMin: 10,
      cookMin: 15,
      tags: ['weeknight', 'pasta'],
      visibility: 'private',
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
        { text: 'Boil pasta in salted water until al dente.', durationSec: 600 },
        { text: 'Melt butter and sauté garlic until fragrant.', durationSec: 180 },
        { text: 'Toss pasta with butter, garlic, and parmesan. Serve.' },
      ],
    },
    {
      id: 'fixture-recipe-chicken-rice',
      householdId,
      title: 'Simple Chicken & Rice',
      servings: 4,
      prepMin: 15,
      cookMin: 30,
      tags: ['dinner', 'protein'],
      visibility: 'private',
      ingredients: [
        {
          ingredientId: 'chicken-breast',
          formId: 'chicken-breast-bulk',
          rawText: '1 lb chicken breast',
          qty: 454,
          unit: 'g',
        },
        {
          ingredientId: 'rice-white',
          formId: 'rice-white-bulk',
          rawText: '1.5 cups rice',
          qty: 280,
          unit: 'g',
        },
        {
          ingredientId: 'onion',
          formId: 'onion-whole',
          rawText: '1 onion',
          qty: 1,
          unit: 'each',
        },
        {
          ingredientId: 'broth-chicken',
          formId: 'broth-chicken-bulk',
          rawText: '2 cups broth',
          qty: 480,
          unit: 'ml',
        },
        {
          ingredientId: 'oil-olive',
          formId: 'oil-olive-liquid',
          rawText: '1 tbsp olive oil',
          qty: 15,
          unit: 'ml',
        },
      ],
      steps: [
        { text: 'Season and sear chicken in oil; set aside.' },
        { text: 'Sauté onion, add rice and broth; simmer.' },
        { text: 'Nestle chicken back in; cook until rice is tender.' },
      ],
    },
    {
      id: 'fixture-recipe-spinach-eggs',
      householdId,
      title: 'Spinach Scramble',
      servings: 2,
      prepMin: 5,
      cookMin: 8,
      tags: ['breakfast', 'quick'],
      visibility: 'private',
      ingredients: [
        {
          ingredientId: 'egg',
          formId: 'egg-whole',
          rawText: '4 eggs',
          qty: 4,
          unit: 'each',
        },
        {
          ingredientId: 'spinach',
          formId: 'spinach-bulk',
          rawText: '2 cups spinach',
          qty: 60,
          unit: 'g',
        },
        {
          ingredientId: 'butter',
          formId: 'butter-stick',
          rawText: '1 tbsp butter',
          qty: 14,
          unit: 'g',
        },
        {
          ingredientId: 'cheddar',
          formId: 'cheddar-block',
          rawText: 'handful cheddar',
          qty: 40,
          unit: 'g',
          optional: true,
        },
      ],
      steps: [
        { text: 'Wilt spinach in butter.' },
        { text: 'Add beaten eggs; scramble soft. Fold in cheese if using.' },
      ],
    },
    {
      id: 'fixture-recipe-black-bean-tacos',
      householdId,
      title: 'Black Bean Tacos',
      servings: 4,
      prepMin: 10,
      cookMin: 15,
      tags: ['vegetarian', 'weeknight'],
      visibility: 'private',
      ingredients: [
        {
          ingredientId: 'beans-black',
          formId: 'beans-black-bulk',
          rawText: '1 can black beans',
          qty: 425,
          unit: 'g',
        },
        {
          ingredientId: 'cumin',
          formId: 'cumin-bulk',
          rawText: '1 tsp cumin',
          qty: 2,
          unit: 'g',
        },
        {
          ingredientId: 'onion',
          formId: 'onion-whole',
          rawText: '1/2 onion',
          qty: 0.5,
          unit: 'each',
        },
        {
          ingredientId: 'garlic',
          formId: 'garlic-clove',
          rawText: '2 cloves garlic',
          qty: 2,
          unit: 'each',
        },
      ],
      steps: [
        { text: 'Sauté onion and garlic; add beans and cumin.' },
        { text: 'Mash lightly; serve in tortillas with toppings.' },
      ],
    },
  ];
}

export type FixtureResult = {
  applied: boolean;
  skipped: boolean;
  version: string;
  pantryItems: number;
  recipes: number;
};

/**
 * Populate demo pantry + recipes. Requires migrations + seed already applied.
 */
export async function generateDevFixtures(
  domain: DomainRepository,
  db: AppDatabase,
  options: {
    householdId?: string;
    force?: boolean;
  } = {},
): Promise<FixtureResult> {
  const householdId = options.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const existing = await db
    .select()
    .from(appMeta)
    .where(eq(appMeta.key, META_FIXTURES_VERSION))
    .limit(1);

  if (existing[0]?.value === FIXTURES_VERSION && !options.force) {
    return {
      applied: false,
      skipped: true,
      version: FIXTURES_VERSION,
      pantryItems: 0,
      recipes: 0,
    };
  }

  const items = buildFixtureItems();
  let pantryCount = 0;
  const now = new Date().toISOString();

  for (const item of items) {
    await domain.appendTxn({
      clientTxnId: `fixture-abs-${item.ingredientId}-${item.formId}`,
      householdId,
      ingredientId: item.ingredientId,
      formId: item.formId,
      kind: 'absolute',
      reason: 'recount',
      targetBase: item.qtyBase,
      occurredAt: now,
      acceptedAt: now,
      deviceId: DEFAULT_DEVICE_ID,
      userId: DEFAULT_USER_ID,
    });

    await domain.upsertPantryItem({
      householdId,
      ingredientId: item.ingredientId,
      formId: item.formId,
      locationId: item.locationId,
      qtyBase: item.qtyBase,
      dim: item.dim,
      parLevelBase: item.parLevelBase,
      lowThresholdPct: item.lowThresholdPct ?? DEFAULT_LOW_THRESHOLD_PCT,
      expiresAt: item.expiresAt ?? null,
      openedAt: item.openedAt ?? null,
      lastVerifiedAt: now,
      unverifiedCookCount: 0,
    });
    pantryCount += 1;
  }

  const recipes = buildFixtureRecipes(householdId);
  for (const recipe of recipes) {
    const existingRecipe = recipe.id ? await domain.getRecipe(recipe.id) : null;
    if (existingRecipe) {
      await domain.updateRecipe(recipe.id!, recipe);
    } else {
      await domain.createRecipe(recipe);
    }
  }

  await db
    .insert(appMeta)
    .values({ key: META_FIXTURES_VERSION, value: FIXTURES_VERSION })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value: FIXTURES_VERSION },
    });

  return {
    applied: true,
    skipped: false,
    version: FIXTURES_VERSION,
    pantryItems: pantryCount,
    recipes: recipes.length,
  };
}
