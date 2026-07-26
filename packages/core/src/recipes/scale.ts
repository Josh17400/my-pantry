/**
 * scaleRecipe — scale every quantified line by target / recipe.servings.
 *
 * Non-quantified lines ("to taste", "a pinch") pass through untouched.
 * Fractional counts (e.g. 2.5 eggs) are kept as-is and flagged —
 * never silently rounded. UI decides presentation.
 */

import { dimensionOf } from '../units/factors';
import type {
  Recipe,
  RecipeLine,
  ScaledRecipe,
  ScaledRecipeLine,
} from './types';

/** True when the line has no scalable quantity. */
export function isNonQuantifiedLine(line: RecipeLine): boolean {
  if (line.nonQuantified === true) return true;
  if (line.qty === null || line.unit === null) return true;
  if (!Number.isFinite(line.qty)) return true;
  return false;
}

/**
 * Count-dimension quantity that is not a whole number after scaling.
 * Uses unit dimension when known; falls back to unit tokens like "each"/"egg".
 */
export function isFractionalCount(unit: string, qty: number): boolean {
  if (!Number.isFinite(qty)) return false;
  const whole =
    Math.abs(qty - Math.round(qty)) < 1e-9 ||
    Math.abs(qty - Math.trunc(qty)) < 1e-9;
  if (whole) return false;

  const dim = dimensionOf(unit);
  if (dim === 'count') return true;

  // Unknown unit tokens common on count lines (eggs, cloves, …)
  const u = unit.trim().toLowerCase();
  if (
    u === 'each' ||
    u === 'egg' ||
    u === 'eggs' ||
    u === 'clove' ||
    u === 'cloves' ||
    u === 'piece' ||
    u === 'pieces' ||
    u === 'whole' ||
    u === 'count'
  ) {
    return true;
  }
  return false;
}

function scaleQty(qty: number | null | undefined, factor: number): number | null {
  if (qty === null || qty === undefined) return null;
  if (!Number.isFinite(qty)) return qty;
  return qty * factor;
}

/**
 * Scale a recipe to `targetServings`.
 *
 * @throws if recipe.servings is not a finite positive number
 * @throws if targetServings is not a finite non-negative number
 */
export function scaleRecipe(recipe: Recipe, targetServings: number): ScaledRecipe {
  if (!Number.isFinite(recipe.servings) || recipe.servings <= 0) {
    throw new RangeError(
      `recipe.servings must be a finite positive number, got ${String(recipe.servings)}`,
    );
  }
  if (!Number.isFinite(targetServings) || targetServings < 0) {
    throw new RangeError(
      `targetServings must be a finite non-negative number, got ${String(targetServings)}`,
    );
  }

  const factor = targetServings / recipe.servings;

  const ingredients: ScaledRecipeLine[] = recipe.ingredients.map((line) => {
    if (isNonQuantifiedLine(line)) {
      return {
        ...line,
        // Pass through completely — do not scale qty even if partially set
        scaleFactor: 1,
        fractionalCount: false,
      };
    }

    const unit = line.unit as string;
    const qty = (line.qty as number) * factor;
    const qtyHigh =
      line.qtyHigh !== undefined ? scaleQty(line.qtyHigh, factor) ?? undefined : undefined;
    const qtyLow =
      line.qtyLow !== undefined ? scaleQty(line.qtyLow, factor) ?? undefined : undefined;

    return {
      ...line,
      qty,
      qtyHigh: qtyHigh === null ? undefined : qtyHigh,
      qtyLow: qtyLow === null ? undefined : qtyLow,
      scaleFactor: factor,
      fractionalCount: isFractionalCount(unit, qty),
    };
  });

  return {
    ...recipe,
    servings: targetServings,
    originalServings: recipe.servings,
    ingredients,
  };
}
