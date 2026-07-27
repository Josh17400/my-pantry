/**
 * Idempotent first-run seeding of catalog + default locations + starter recipes.
 *
 * Ingredients / forms / edges / packages come from `@larder/core` seed.
 * Starter recipes come from `@larder/core` starterRecipes.
 * Ingredient seed version is recorded in `app_meta.seed_version`.
 * Recipe catalogue version is recorded in `app_meta.recipe_seed_version`
 * (independent, so existing installs gain recipes without wiping user data).
 */

import {
  DEFAULT_LOW_THRESHOLD_PCT,
  SEED_VERSION,
  seedCatalog,
  seedEdges,
  seedForms,
  seedIngredients,
  seedPackages,
} from '@larder/core';
import { eq } from 'drizzle-orm';

import {
  DEFAULT_HOUSEHOLD_ID,
  LOCATIONS_TREE_VERSION,
  META_LOCATIONS_SEEDED,
  META_RECIPE_SEED_VERSION,
  META_SEED_VERSION,
  RECIPE_SEED_VERSION,
} from './constants';
import { DEFAULT_LOCATIONS } from './default-locations';
import { type AppDatabase, DomainRepository } from './domain-repository';
import { migrateLocationsTree } from './locations-migration';
import {
  appMeta,
  conversionEdges,
  ingredientForms,
  ingredients,
  locations,
  packageSpecs,
} from './schema';
import { seedStarterRecipes, starterCatalogSize } from './seed-recipes';

export type SeedResult = {
  seedVersion: string;
  previousSeedVersion: string | null;
  ingredientsUpserted: number;
  formsUpserted: number;
  edgesUpserted: number;
  packagesUpserted: number;
  locationsSeeded: boolean;
  locationsTreeVersion: string;
  skippedCatalog: boolean;
  /** Starter recipe catalogue version applied (or already present). */
  recipeSeedVersion: string;
  previousRecipeSeedVersion: string | null;
  recipesUpserted: number;
  skippedRecipes: boolean;
};

async function getMeta(db: AppDatabase, key: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(appMeta)
    .where(eq(appMeta.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

async function setMeta(db: AppDatabase, key: string, value: string): Promise<void> {
  await db
    .insert(appMeta)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value },
    });
}

/**
 * Seed catalog + default locations + starter recipes. Safe on every app start.
 * Ingredient upsert is skipped when `SEED_VERSION` matches meta.
 * Recipe upsert is skipped when `RECIPE_SEED_VERSION` matches meta.
 * Versions are independent so recipe catalogue can land on existing installs.
 */
export async function runSeed(
  db: AppDatabase,
  options: { householdId?: string; force?: boolean } = {},
): Promise<SeedResult> {
  const householdId = options.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const previousSeedVersion = await getMeta(db, META_SEED_VERSION);
  const previousRecipeSeedVersion = await getMeta(db, META_RECIPE_SEED_VERSION);
  const locationsFlag = await getMeta(db, META_LOCATIONS_SEEDED);

  let locationsSeeded = false;
  if (locationsFlag !== '1' || options.force) {
    for (const loc of DEFAULT_LOCATIONS) {
      await db
        .insert(locations)
        .values({
          id: loc.id,
          householdId,
          name: loc.name,
          icon: loc.icon,
          tint: loc.tint,
          parentId: loc.parentId,
          sortOrder: loc.sortOrder,
        })
        .onConflictDoNothing();
    }
    await setMeta(db, META_LOCATIONS_SEEDED, '1');
    locationsSeeded = true;
  }

  // Reparent / add Freezer / drop Around the House when the tree version is stale.
  // Fresh seeds insert the current shape; migration still stamps the version.
  await migrateLocationsTree(db, {
    householdId,
    force: options.force,
  });

  let ingredientsUpserted = 0;
  let formsUpserted = 0;
  let edgesUpserted = 0;
  let packagesUpserted = 0;
  let skippedCatalog = false;

  if (previousSeedVersion === SEED_VERSION && !options.force) {
    skippedCatalog = true;
  } else {
    // Chunked upserts keep sqlite-proxy / Capacitor batches reasonable.
    const CHUNK = 50;

    for (let i = 0; i < seedIngredients.length; i += CHUNK) {
      const slice = seedIngredients.slice(i, i + CHUNK);
      for (const ing of slice) {
        await db
          .insert(ingredients)
          .values({
            id: ing.id,
            name: ing.name,
            category: ing.category,
            allergens: JSON.stringify([...ing.allergens]),
            isStaple: ing.isStaple,
            defaultFormId: ing.defaultFormId,
          })
          .onConflictDoUpdate({
            target: ingredients.id,
            set: {
              name: ing.name,
              category: ing.category,
              allergens: JSON.stringify([...ing.allergens]),
              isStaple: ing.isStaple,
              defaultFormId: ing.defaultFormId,
            },
          });
      }
    }
    ingredientsUpserted = seedIngredients.length;

    for (let i = 0; i < seedForms.length; i += CHUNK) {
      const slice = seedForms.slice(i, i + CHUNK);
      for (const form of slice) {
        await db
          .insert(ingredientForms)
          .values({
            id: form.id,
            ingredientId: form.ingredientId,
            form: form.form,
            dim: form.dim,
            densityGPerMl: form.densityGPerMl ?? null,
            gramsPerCount: form.gramsPerCount ?? null,
            uncertaintyPct: form.uncertaintyPct,
          })
          .onConflictDoUpdate({
            target: ingredientForms.id,
            set: {
              ingredientId: form.ingredientId,
              form: form.form,
              dim: form.dim,
              densityGPerMl: form.densityGPerMl ?? null,
              gramsPerCount: form.gramsPerCount ?? null,
              uncertaintyPct: form.uncertaintyPct,
            },
          });
      }
    }
    formsUpserted = seedForms.length;

    for (let i = 0; i < seedEdges.length; i += CHUNK) {
      const slice = seedEdges.slice(i, i + CHUNK);
      for (const edge of slice) {
        await db
          .insert(conversionEdges)
          .values({
            fromFormId: edge.fromFormId,
            toFormId: edge.toFormId,
            factor: edge.factor,
            uncertaintyPct: edge.uncertaintyPct,
            source: edge.source,
            oneWay: edge.oneWay ?? false,
          })
          .onConflictDoUpdate({
            target: [conversionEdges.fromFormId, conversionEdges.toFormId],
            set: {
              factor: edge.factor,
              uncertaintyPct: edge.uncertaintyPct,
              source: edge.source,
              oneWay: edge.oneWay ?? false,
            },
          });
      }
    }
    edgesUpserted = seedEdges.length;

    for (let i = 0; i < seedPackages.length; i += CHUNK) {
      const slice = seedPackages.slice(i, i + CHUNK);
      for (const pack of slice) {
        await db
          .insert(packageSpecs)
          .values({
            formId: pack.formId,
            label: pack.label,
            netG: pack.netG,
            drainedG: pack.drainedG ?? null,
          })
          .onConflictDoUpdate({
            target: [packageSpecs.formId, packageSpecs.label],
            set: {
              netG: pack.netG,
              drainedG: pack.drainedG ?? null,
            },
          });
      }
    }
    packagesUpserted = seedPackages.length;

    await setMeta(db, META_SEED_VERSION, SEED_VERSION);
  }

  // Starter recipes — versioned independently so existing installs gain them.
  let recipesUpserted = 0;
  let skippedRecipes = false;

  if (previousRecipeSeedVersion === RECIPE_SEED_VERSION && !options.force) {
    skippedRecipes = true;
  } else {
    const domain = new DomainRepository(db);
    const result = await seedStarterRecipes(domain);
    recipesUpserted = result.recipesUpserted;
    await setMeta(db, META_RECIPE_SEED_VERSION, RECIPE_SEED_VERSION);
  }

  return {
    seedVersion: SEED_VERSION,
    previousSeedVersion,
    ingredientsUpserted,
    formsUpserted,
    edgesUpserted,
    packagesUpserted,
    locationsSeeded,
    locationsTreeVersion: LOCATIONS_TREE_VERSION,
    skippedCatalog,
    recipeSeedVersion: RECIPE_SEED_VERSION,
    previousRecipeSeedVersion,
    recipesUpserted,
    skippedRecipes,
  };
}

/** Catalog counts for diagnostics. */
export function seedCatalogStats(): {
  version: string;
  ingredients: number;
  forms: number;
  edges: number;
  packages: number;
  recipes: number;
  recipeSeedVersion: string;
  defaultLowThresholdPct: number;
} {
  return {
    version: seedCatalog.version,
    ingredients: seedIngredients.length,
    forms: seedForms.length,
    edges: seedEdges.length,
    packages: seedPackages.length,
    recipes: starterCatalogSize(),
    recipeSeedVersion: RECIPE_SEED_VERSION,
    defaultLowThresholdPct: DEFAULT_LOW_THRESHOLD_PCT,
  };
}
