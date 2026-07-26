/**
 * @larder/core/domain — shared vocabulary (shapes only, no math, no I/O).
 *
 * Units owns conversion math; pantry owns ledger fold; this module owns the
 * names everything else speaks.
 */

export type {
  Allergen,
  AllergenTags,
  DietaryFlag,
  DietaryTags,
} from './allergens';
export {
  ALLERGEN_SET,
  ALLERGENS,
  allergensDisagree,
  canAutoMergeAllergens,
  canAutoMergeDietaryFlags,
  canAutoMergeSafety,
  DIETARY_FLAG_SET,
  DIETARY_FLAGS,
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
