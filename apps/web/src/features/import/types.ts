/**
 * URL recipe import — schema.org Recipe JSON-LD / microdata.
 */

import type { MatchedIngredientLine } from '../community/types';
import type { ImportProvenance } from '../community/types';

export type RecipeLocale = 'us' | 'imperial' | 'metric' | 'unknown';

export type LocaleAmbiguity = {
  readonly unit: string;
  readonly rawLine: string;
  readonly lineIndex: number;
  /**
   * True when parseQuantity flagged ambiguousLocale (pint/quart/gallon/fl oz/cup).
   * Import must prompt — do not guess US vs Imperial.
   */
  readonly ambiguousLocale: true;
};

export type ExtractedRecipe = {
  readonly name: string;
  readonly description: string | null;
  readonly servings: number | null;
  readonly prepMin: number | null;
  readonly cookMin: number | null;
  readonly totalMin: number | null;
  readonly ingredients: readonly string[];
  readonly steps: readonly string[];
  readonly imageUrl: string | null;
  readonly keywords: readonly string[];
  readonly sourceUrl: string | null;
  readonly recipeCuisine: string | null;
  readonly recipeCategory: string | null;
  readonly inLanguage: string | null;
};

export type ExtractResult =
  | {
      readonly ok: true;
      readonly recipe: ExtractedRecipe;
      readonly source: 'json-ld' | 'microdata';
    }
  | {
      readonly ok: false;
      readonly code: 'no_structured_data' | 'parse_error' | 'empty';
      readonly message: string;
    };

export type LocaleDetection = {
  readonly locale: RecipeLocale;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly signals: readonly string[];
  /**
   * When true, any ambiguousLocale units require an explicit user choice
   * before save (even if locale was guessed).
   */
  readonly promptOnAmbiguous: boolean;
};

export type LocaleChoice = 'us' | 'imperial';

export type ImportReviewLine = MatchedIngredientLine & {
  readonly originalRaw: string;
  readonly ambiguousLocale: boolean;
  readonly unitToken: string | null;
};

export type ImportReviewState = {
  readonly extracted: ExtractedRecipe;
  readonly source: 'json-ld' | 'microdata' | 'manual';
  readonly sourceUrl: string | null;
  readonly lines: readonly ImportReviewLine[];
  readonly localeDetection: LocaleDetection;
  /** User choice when ambiguous units present. Null until answered. */
  readonly localeChoice: LocaleChoice | null;
  readonly ambiguousLines: readonly LocaleAmbiguity[];
  readonly provenance: ImportProvenance;
};

export type ImportSaveBlock =
  | { readonly blocked: false }
  | {
      readonly blocked: true;
      readonly code: 'locale_unresolved' | 'no_title' | 'no_ingredients';
      readonly message: string;
    };

export type ManualPasteInput = {
  readonly name: string;
  readonly servings?: number | null;
  readonly prepMin?: number | null;
  readonly cookMin?: number | null;
  readonly ingredientsText: string;
  readonly stepsText: string;
  readonly sourceUrl?: string | null;
};
