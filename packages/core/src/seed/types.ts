/**
 * Seed-layer types. Domain shapes (Ingredient, IngredientForm, …) are imported
 * from `domain/` — do not re-declare them here.
 *
 * Aliases live only on the seed layer: the domain Ingredient is the matching
 * target; aliases feed the matcher (Track C) without polluting the core shape.
 */

import type {
  ConversionEdge,
  Ingredient,
  IngredientForm,
  PackageSpec,
} from '../domain/types';

/** Canonical ingredient plus matching aliases (receipt abbreviations, synonyms). */
export type SeedIngredient = Ingredient & {
  readonly aliases: readonly string[];
};

/** One category module’s contribution to the catalog. */
export interface SeedCategoryBundle {
  readonly ingredients: readonly SeedIngredient[];
  readonly forms: readonly IngredientForm[];
  readonly edges: readonly ConversionEdge[];
  readonly packages: readonly PackageSpec[];
}

/** Full assembled seed catalog. */
export interface SeedCatalog extends SeedCategoryBundle {
  readonly version: string;
}

/** Structured validation failure. */
export interface SeedValidationIssue {
  readonly code: SeedValidationCode;
  readonly message: string;
  readonly path?: string;
}

export type SeedValidationCode =
  | 'duplicate_ingredient_id'
  | 'duplicate_form_id'
  | 'alias_collision'
  | 'missing_default_form'
  | 'default_form_wrong_ingredient'
  | 'orphan_form'
  | 'edge_unknown_form'
  | 'edge_cross_ingredient'
  | 'duplicate_direction_edge'
  | 'package_unknown_form'
  | 'no_forms'
  | 'form_missing_density'
  | 'form_missing_grams_per_count'
  | 'density_out_of_band'
  | 'invalid_allergen'
  | 'empty_id'
  | 'invalid_factor'
  | 'invalid_uncertainty';

export interface SeedValidationResult {
  readonly ok: boolean;
  readonly issues: readonly SeedValidationIssue[];
}
