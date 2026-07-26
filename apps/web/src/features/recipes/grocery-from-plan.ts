/**
 * Turn plan shortfalls / user flags into grocery list item inputs.
 */

import { formatQuantity } from '@larder/core';

import type { GroceryListItemInput } from '../../db/types';
import { getIngredientCategory, getIngredientName } from './catalog';
import {
  sourcesFromPlanShortfalls,
  type CookPlan,
  type GrocerySource,
} from './core-imports';
import type { CookLineEdit } from './cook-machine';

function displayForSource(src: GrocerySource): string {
  if (src.qtyBase != null && src.dim) {
    return formatQuantity(src.qtyBase, src.dim);
  }
  if (src.rawText) return src.rawText;
  return 'as needed';
}

export function groceryItemsFromPlan(
  recipeId: string,
  recipeTitle: string,
  plan: CookPlan,
): GroceryListItemInput[] {
  const names = new Map<string, string>();
  const categories = new Map<string, string>();
  for (const pl of plan.lines) {
    const id = pl.line.ingredientId;
    if (id) {
      names.set(id, getIngredientName(id));
      categories.set(id, getIngredientCategory(id));
    }
  }

  const sources = sourcesFromPlanShortfalls(recipeId, plan, {
    recipeTitle,
    names,
    categories,
  });

  return sources.map((src) => ({
    ingredientId: src.ingredientId ?? null,
    formId: src.formId ?? null,
    name: src.name ?? src.rawText ?? 'Unknown',
    category: src.category ?? getIngredientCategory(src.ingredientId) ?? 'Other',
    qtyBase: src.qtyBase ?? null,
    dim: src.dim ?? null,
    displayQty: displayForSource(src),
    sources: [src.kind],
    recipeIds: [recipeId],
    notes: src.note ?? null,
  }));
}

/** Grocery items from user-flagged cook preview lines (may differ from plan). */
export function groceryItemsFromCookLines(
  recipeId: string,
  lines: readonly CookLineEdit[],
): GroceryListItemInput[] {
  const items: GroceryListItemInput[] = [];
  for (const line of lines) {
    if (!line.sendShortfallToGrocery) continue;
    if (line.status === 'enough' || line.status === 'non-quantified') continue;
    if (line.status === 'optional-missing' && !line.sendShortfallToGrocery) {
      continue;
    }

    const name =
      getIngredientName(line.ingredientId) || line.rawText || 'Unknown';
    const shortfall =
      line.shortfallBase ??
      (line.needBase != null && line.haveBase != null
        ? Math.max(0, line.needBase - line.haveBase)
        : null);

    items.push({
      ingredientId: line.ingredientId ?? null,
      formId: line.formId ?? line.pantryFormId ?? null,
      name,
      category: getIngredientCategory(line.ingredientId),
      qtyBase: shortfall,
      dim: line.needDim ?? null,
      displayQty:
        shortfall != null && line.needDim
          ? formatQuantity(shortfall, line.needDim)
          : line.rawText || 'as needed',
      sources: ['recipe-shortfall'],
      recipeIds: [recipeId],
      notes:
        line.status === 'not-convertible'
          ? 'Not convertible — check form/unit manually'
          : line.substitutionNote || null,
    });
  }
  return items;
}
