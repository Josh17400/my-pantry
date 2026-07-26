/**
 * Canonical ingredient seed catalog.
 *
 * Import domain types from `../domain` — shapes are not re-declared here.
 * Architect wires public re-exports from `packages/core/src/index.ts`.
 */

import {
  babyHousehold,
  baking,
  beverages,
  canned,
  condiments,
  dairy,
  frozen,
  grainsPasta,
  meatSeafood,
  oilsVinegars,
  pantryStaples,
  produce,
  spicesHerbs,
} from './categories';
import { mergeBundles } from './helpers';
import type { SeedCatalog, SeedCategoryBundle } from './types';
import { validateSeed } from './validate';

export * from './categories';
export {
  bundle,
  countForm,
  edge,
  form,
  ingredient,
  massForm,
  mergeBundles,
  pack,
  simpleCount,
  simpleMass,
  simpleVolume,
  volumeForm,
} from './helpers';
export type { DensitySourceKey } from './sources';
export {
  CUP_ML,
  DENSITY_SOURCES,
  FL_OZ_ML,
  GALLON_ML,
  KNOWN_DENSITIES,
  LB_G,
  OZ_G,
} from './sources';
export type {
  SeedCatalog,
  SeedCategoryBundle,
  SeedIngredient,
  SeedValidationCode,
  SeedValidationIssue,
  SeedValidationResult,
} from './types';
export {
  DENSITY_MAX_G_PER_ML,
  DENSITY_MIN_G_PER_ML,
  normalizeAlias,
  undirectedEdgeKey,
  validateSeed,
} from './validate';

/** Seed schema version — bump when breaking seed shape for loaders. */
export const SEED_VERSION = '1.0.0' as const;

/** Ordered category contributions (stable merge order for diffs). */
export const SEED_CATEGORIES: readonly SeedCategoryBundle[] = [
  produce,
  dairy,
  meatSeafood,
  grainsPasta,
  pantryStaples,
  canned,
  baking,
  spicesHerbs,
  condiments,
  oilsVinegars,
  frozen,
  beverages,
  babyHousehold,
] as const;

const merged = mergeBundles(...SEED_CATEGORIES);

/**
 * Full assembled catalog. Pass to `validateSeed()` before shipping / matching.
 */
export const seedCatalog: SeedCatalog = {
  version: SEED_VERSION,
  ingredients: merged.ingredients,
  forms: merged.forms,
  edges: merged.edges,
  packages: merged.packages,
};

/** Convenience accessors */
export const seedIngredients = seedCatalog.ingredients;
export const seedForms = seedCatalog.forms;
export const seedEdges = seedCatalog.edges;
export const seedPackages = seedCatalog.packages;

/** Count helpers for reports / smoke tests */
export function countByCategory(
  catalog: SeedCategoryBundle = seedCatalog,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ing of catalog.ingredients) {
    out[ing.category] = (out[ing.category] ?? 0) + 1;
  }
  return out;
}

/**
 * Run validation and throw with a readable multi-line message on failure.
 * Useful for boot-time asserts; tests should prefer validateSeed() directly.
 */
export function assertSeedValid(
  catalog: SeedCategoryBundle | SeedCatalog = seedCatalog,
): void {
  const result = validateSeed(catalog);
  if (!result.ok) {
    const lines = result.issues.map(
      (i) => `  [${i.code}] ${i.message}${i.path ? ` (${i.path})` : ''}`,
    );
    throw new Error(
      `seed validation failed (${result.issues.length} issue(s)):\n${lines.join('\n')}`,
    );
  }
}
