/**
 * Run free-text ingredient lines through matchIngredient.
 * Unresolved lines keep unknownAllergens: true — never assume clear.
 */

import { parseQuantity } from '@larder/core';

import type { RecipeLineInput } from '../../db/types';
import {
  type MatchCatalog,
  matchIngredient,
  type MatchResult,
} from './core-imports';
import type { MatchedIngredientLine } from './types';

export type MatchLinesOptions = {
  readonly catalog: MatchCatalog;
  readonly path?: 'recipe' | 'import' | 'general';
  readonly householdId?: string;
};

function matchMeta(result: MatchResult): {
  matched: boolean;
  ingredientId?: string;
  confidence: number | null;
  step: string | null;
} {
  if (result.kind === 'match' && result.autoAccept) {
    return {
      matched: true,
      ingredientId: result.ingredient.id,
      confidence: result.confidence,
      step: result.step,
    };
  }
  if (result.kind === 'match' && !result.autoAccept) {
    // High-ish match but not auto — still attach id only if confidence is strong;
    // otherwise leave unmatched so unknownAllergens stays true.
    if (result.confidence >= 0.9 && result.vetoes.length === 0) {
      return {
        matched: true,
        ingredientId: result.ingredient.id,
        confidence: result.confidence,
        step: result.step,
      };
    }
    return {
      matched: false,
      confidence: result.confidence,
      step: result.step,
    };
  }
  return { matched: false, confidence: null, step: result.kind };
}

/**
 * Match a single free-text line. Unmatched → unknownAllergens: true.
 */
export function matchFreeTextLine(
  rawText: string,
  options: MatchLinesOptions,
): MatchedIngredientLine {
  const raw = rawText.trim();
  const parsed = parseQuantity(raw);

  let qty: number | null = null;
  let unit: string | null = null;
  let nonQuantified = false;
  let qtyHigh: number | undefined;
  let qtyLow: number | undefined;
  let isRange: boolean | undefined;

  if (parsed.kind === 'quantity') {
    qty = parsed.qty;
    unit = parsed.unitKnown ? String(parsed.unit) : String(parsed.unit);
    if (parsed.isRange) {
      isRange = true;
      qtyHigh = parsed.high;
      qtyLow = parsed.low;
    }
  } else if (parsed.kind === 'non-quantified') {
    nonQuantified = true;
    qty = null;
    unit = null;
  }

  // Strip leading quantity tokens for matcher when possible
  const nameForMatch =
    parsed.kind === 'quantity'
      ? stripLeadingQuantity(raw)
      : raw;

  const result = matchIngredient({
    raw: nameForMatch || raw,
    catalog: options.catalog,
    path: options.path ?? 'recipe',
    householdId: options.householdId,
  });

  const meta = matchMeta(result);
  const formId = meta.matched
    ? options.catalog.ingredients.find((i) => i.id === meta.ingredientId)
        ?.defaultFormId
    : undefined;

  return {
    rawText: raw || rawText,
    ingredientId: meta.ingredientId,
    formId,
    qty,
    unit,
    optional: false,
    unknownAllergens: !meta.matched,
    nonQuantified: nonQuantified || (qty == null && unit == null && parsed.kind !== 'quantity'),
    qtyHigh,
    qtyLow,
    isRange,
    matched: meta.matched,
    matchConfidence: meta.confidence,
    matchStep: meta.step,
  };
}

/** Match many lines (import / community free text). */
export function matchFreeTextLines(
  lines: readonly string[],
  options: MatchLinesOptions,
): MatchedIngredientLine[] {
  return lines.map((line) => matchFreeTextLine(line, options));
}

/** Drop match metadata for RecipeWrite persistence. */
export function toRecipeLineInput(
  line: MatchedIngredientLine,
): RecipeLineInput {
  return {
    ingredientId: line.ingredientId,
    formId: line.formId,
    rawText: line.rawText,
    qty: line.qty,
    unit: line.unit,
    optional: line.optional,
    group: line.group,
    substitutes: line.substitutes,
    unknownAllergens: line.unknownAllergens,
    nonQuantified: line.nonQuantified,
    qtyHigh: line.qtyHigh,
    qtyLow: line.qtyLow,
    isRange: line.isRange,
  };
}

/**
 * Remove a leading quantity+unit fragment so the matcher sees "flour" not "2 cups flour".
 */
function stripLeadingQuantity(raw: string): string {
  // Common patterns: "2 cups flour", "1 1/2 tsp salt", "½ onion"
  const stripped = raw
    .replace(
      /^\s*[\d½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒./\-\s]+\s*(?:cups?|c|tbsp|tbsps?|tsp|tsps?|tablespoons?|teaspoons?|oz|ounces?|lb|lbs|pounds?|g|grams?|kg|ml|l|liters?|litres?|pints?|pt|quarts?|qt|gallons?|gal|fl\.?\s*oz|cloves?|slices?|pieces?|cans?|packages?|pkgs?|bunches?|heads?|pinch(?:es)?|dash(?:es)?)?\s+/i,
      '',
    )
    .trim();
  return stripped.length > 0 ? stripped : raw;
}
