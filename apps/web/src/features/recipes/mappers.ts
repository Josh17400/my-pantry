/**
 * Map app-layer RecipeDetail / pantry rows into @larder/core recipe shapes.
 */

import type { Dimension } from '@larder/core';

import type { PantryItemView, RecipeDetail } from '../../db/types';
import type { PantryStockRow, Recipe, RecipeLine } from './core-imports';

export function recipeDetailToCore(detail: RecipeDetail): Recipe {
  const ingredients: RecipeLine[] = detail.ingredients.map((line) => ({
    ingredientId: line.ingredientId,
    formId: line.formId,
    rawText: line.rawText,
    qty: line.qty ?? null,
    unit: line.unit ?? null,
    optional: line.optional,
    group: line.group,
    substitutes: line.substitutes,
    unknownAllergens: line.unknownAllergens,
    nonQuantified: line.nonQuantified,
    qtyHigh: line.qtyHigh,
    qtyLow: line.qtyLow,
    isRange: line.isRange,
  }));

  return {
    id: detail.id,
    householdId: detail.householdId ?? undefined,
    title: detail.title,
    servings: detail.servings,
    yieldNote: detail.yieldNote ?? undefined,
    prepMin: detail.prepMin ?? undefined,
    cookMin: detail.cookMin ?? undefined,
    ingredients,
    steps: detail.steps.map((s) => ({
      text: s.text,
      durationSec: s.durationSec,
      timerLabel: s.timerLabel,
    })),
    authorId: detail.authorId ?? undefined,
    visibility: detail.visibility as Recipe['visibility'],
    forkedFrom: detail.forkedFrom ?? undefined,
    tags: detail.tags,
    imageUrl: detail.imageUrl ?? undefined,
  };
}

export function pantryItemsToStock(
  items: readonly PantryItemView[],
): PantryStockRow[] {
  return items.map((item) => ({
    ingredientId: item.ingredientId,
    formId: item.formId,
    qtyBase: item.qtyBase,
    dim: item.dim as Dimension,
    expiresAt: item.expiresAt,
    locationId: item.locationId ?? undefined,
  }));
}

export function formatMinutes(prepMin: number | null | undefined, cookMin: number | null | undefined): string {
  const parts: string[] = [];
  if (prepMin != null && prepMin > 0) parts.push(`${prepMin} prep`);
  if (cookMin != null && cookMin > 0) parts.push(`${cookMin} cook`);
  if (parts.length === 0) {
    const total = (prepMin ?? 0) + (cookMin ?? 0);
    if (total > 0) return `${total} min`;
    return 'Time n/a';
  }
  const total = (prepMin ?? 0) + (cookMin ?? 0);
  return total > 0 ? `${total} min · ${parts.join(' · ')}` : parts.join(' · ');
}

export function totalMinutes(
  prepMin: number | null | undefined,
  cookMin: number | null | undefined,
): number | null {
  const p = prepMin ?? 0;
  const c = cookMin ?? 0;
  if (p <= 0 && c <= 0) return null;
  return p + c;
}
