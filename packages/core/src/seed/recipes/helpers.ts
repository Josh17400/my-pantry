/**
 * Compact builders for starter catalog recipes.
 * All prose in category modules is original; helpers only shape the data.
 */

import type { Recipe, RecipeLine, RecipeStep } from '../../recipes/types';

/** Quantified line bound to a catalog ingredient + form. */
export function qty(
  ingredientId: string,
  formId: string,
  rawText: string,
  amount: number,
  unit: string,
  opts: {
    readonly optional?: boolean;
    readonly group?: string;
    readonly substitutes?: readonly string[];
    readonly qtyHigh?: number;
    readonly qtyLow?: number;
    readonly isRange?: boolean;
  } = {},
): RecipeLine {
  const line: RecipeLine = {
    ingredientId,
    formId,
    rawText,
    qty: amount,
    unit,
    unknownAllergens: false,
  };
  if (opts.optional === true) {
    return {
      ...line,
      optional: true,
      ...(opts.group !== undefined ? { group: opts.group } : {}),
      ...(opts.substitutes !== undefined ? { substitutes: opts.substitutes } : {}),
      ...(opts.qtyHigh !== undefined ? { qtyHigh: opts.qtyHigh } : {}),
      ...(opts.qtyLow !== undefined ? { qtyLow: opts.qtyLow } : {}),
      ...(opts.isRange === true ? { isRange: true } : {}),
    };
  }
  return {
    ...line,
    ...(opts.group !== undefined ? { group: opts.group } : {}),
    ...(opts.substitutes !== undefined ? { substitutes: opts.substitutes } : {}),
    ...(opts.qtyHigh !== undefined ? { qtyHigh: opts.qtyHigh } : {}),
    ...(opts.qtyLow !== undefined ? { qtyLow: opts.qtyLow } : {}),
    ...(opts.isRange === true ? { isRange: true } : {}),
  };
}

/** Non-quantified garnish / seasoning ("to taste", pinch, for serving). */
export function taste(
  ingredientId: string,
  formId: string,
  rawText: string,
  opts: { readonly optional?: boolean } = {},
): RecipeLine {
  return {
    ingredientId,
    formId,
    rawText,
    qty: null,
    unit: null,
    nonQuantified: true,
    unknownAllergens: false,
    ...(opts.optional === true ? { optional: true } : {}),
  };
}

export function step(
  text: string,
  durationSec?: number,
  timerLabel?: string,
): RecipeStep {
  if (durationSec !== undefined) {
    return timerLabel !== undefined
      ? { text, durationSec, timerLabel }
      : { text, durationSec };
  }
  return { text };
}

export type RecipeDef = {
  readonly id: string;
  readonly title: string;
  readonly servings: number;
  readonly prepMin: number;
  readonly cookMin: number;
  readonly ingredients: readonly RecipeLine[];
  readonly steps: readonly RecipeStep[];
  readonly tags: readonly string[];
  readonly yieldNote?: string;
};

/** Catalog recipe: public, no household, system-authored. */
export function recipe(def: RecipeDef): Recipe {
  return {
    id: def.id,
    title: def.title,
    servings: def.servings,
    prepMin: def.prepMin,
    cookMin: def.cookMin,
    ingredients: def.ingredients,
    steps: def.steps,
    tags: def.tags,
    visibility: 'public',
    authorId: 'good-pantry',
    ...(def.yieldNote !== undefined ? { yieldNote: def.yieldNote } : {}),
  };
}
