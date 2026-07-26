/**
 * @larder/core/domain — shared vocabulary (shapes only, no math, no I/O).
 *
 * Units owns conversion math; pantry owns ledger fold; this module owns the
 * names everything else speaks.
 */

export type {
  BaseUnit,
  ConversionEdge,
  Dimension,
  Ingredient,
  IngredientForm,
  Location,
  PackageSpec,
  QtyBase,
} from './types';

export type {
  Allergen,
  AllergenTags,
  DietaryFlag,
  DietaryTags,
} from './allergens';
export {
  ALLERGENS,
  ALLERGEN_SET,
  DIETARY_FLAGS,
  DIETARY_FLAG_SET,
  allergensDisagree,
  canAutoMergeAllergens,
  canAutoMergeDietaryFlags,
  canAutoMergeSafety,
  dietaryFlagsDisagree,
  ingredientHitsAvoidList,
  isAllergen,
  isDietaryFlag,
  knownAllergens,
  knownDietaryFlags,
  safetyTagsDisagree,
  unknownAllergenTags,
  unknownDietaryTags,
} from './allergens';
