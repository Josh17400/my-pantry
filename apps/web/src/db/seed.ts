/**
 * Idempotent first-run seeding of catalog + default locations.
 *
 * Ingredients / forms / edges / packages come from `@larder/core` seed.
 * Seed version is recorded in `app_meta`; changing SEED_VERSION re-upserts.
 * Location tree shape is versioned separately (LOCATIONS_TREE_VERSION).
 */

import { DEFAULT_LOW_THRESHOLD_PCT } from '@larder/core';
import { eq } from 'drizzle-orm';

// Seed catalog is implemented in packages/core but not re-exported from the
// package root entry (noted in m1-g report). Import the module path directly.
import {
  SEED_VERSION,
  seedCatalog,
  seedEdges,
  seedForms,
  seedIngredients,
  seedPackages,
} from '../../../../packages/core/src/seed/index.ts';
import {
  DEFAULT_HOUSEHOLD_ID,
  LOCATIONS_TREE_VERSION,
  META_LOCATIONS_SEEDED,
  META_SEED_VERSION,
} from './constants';
import { DEFAULT_LOCATIONS } from './default-locations';
import type { AppDatabase } from './domain-repository';
import { migrateLocationsTree } from './locations-migration';
import {
  appMeta,
  conversionEdges,
  ingredientForms,
  ingredients,
  locations,
  packageSpecs,
} from './schema';

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
 * Seed catalog + default locations. Safe on every app start.
 * When `SEED_VERSION` matches `app_meta.seed_version`, catalog upsert is skipped
 * (locations still ensure-exist once; tree migration still runs if needed).
 */
export async function runSeed(
  db: AppDatabase,
  options: { householdId?: string; force?: boolean } = {},
): Promise<SeedResult> {
  const householdId = options.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const previousSeedVersion = await getMeta(db, META_SEED_VERSION);
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

  if (previousSeedVersion === SEED_VERSION && !options.force) {
    return {
      seedVersion: SEED_VERSION,
      previousSeedVersion,
      ingredientsUpserted: 0,
      formsUpserted: 0,
      edgesUpserted: 0,
      packagesUpserted: 0,
      locationsSeeded,
      locationsTreeVersion: LOCATIONS_TREE_VERSION,
      skippedCatalog: true,
    };
  }

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

  await setMeta(db, META_SEED_VERSION, SEED_VERSION);

  return {
    seedVersion: SEED_VERSION,
    previousSeedVersion,
    ingredientsUpserted: seedIngredients.length,
    formsUpserted: seedForms.length,
    edgesUpserted: seedEdges.length,
    packagesUpserted: seedPackages.length,
    locationsSeeded,
    locationsTreeVersion: LOCATIONS_TREE_VERSION,
    skippedCatalog: false,
  };
}

/** Catalog counts for diagnostics. */
export function seedCatalogStats(): {
  version: string;
  ingredients: number;
  forms: number;
  edges: number;
  packages: number;
  defaultLowThresholdPct: number;
} {
  return {
    version: seedCatalog.version,
    ingredients: seedIngredients.length,
    forms: seedForms.length,
    edges: seedEdges.length,
    packages: seedPackages.length,
    defaultLowThresholdPct: DEFAULT_LOW_THRESHOLD_PCT,
  };
}
