/**
 * Cook-now + recipe inspiration — thin UI adapter over @larder/core.
 *
 * findCookableRecipes is free-tier core logic, NOT AI.
 * Ranked fully-cookable first, then fewest missing, then use-up expiring.
 *
 * Note: findCookableRecipes is not yet re-exported from the package root
 * (`@larder/core`); import from the recipes module path (same pattern as seed).
 */

import type { Dimension } from '@larder/core';

import { findCookableRecipes } from '../../../../../packages/core/src/recipes/cookable.ts';
import type {
  CookableMatch,
  PantryStockRow,
  Recipe,
} from '../../../../../packages/core/src/recipes/types.ts';
import {
  seedEdges,
  seedForms,
  seedIngredients,
} from '../../../../../packages/core/src/seed/index.ts';

export type { CookableMatch };

const ingredientNameById = new Map(
  seedIngredients.map((i) => [i.id, i.name] as const),
);

export function ingredientDisplayName(id: string): string {
  const raw = ingredientNameById.get(id) ?? id;
  // Strip form notes: "Spinach (fresh)" → "spinach"
  return raw.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

export type CookNowResult = {
  /** Fully cookable recipe count (banner number). */
  fullyCookableCount: number;
  /** Ranked matches (cookable first, use-up promoted). */
  matches: CookableMatch[];
  /** Inspiration rail: prefer use-up, then fully cookable. */
  inspiration: CookableMatch[];
};

export function pantryItemsToStockRows(
  items: readonly {
    ingredientId: string;
    formId: string;
    qtyBase: number;
    dim: Dimension;
    expiresAt: string | null;
    locationId: string | null;
  }[],
): PantryStockRow[] {
  return items.map((i) => ({
    ingredientId: i.ingredientId,
    formId: i.formId,
    qtyBase: i.qtyBase,
    dim: i.dim,
    expiresAt: i.expiresAt,
    locationId: i.locationId ?? undefined,
  }));
}

/**
 * Run cook-now matching with seed conversion graph.
 */
export function computeCookNow(
  recipes: readonly Recipe[],
  pantry: readonly PantryStockRow[],
  opts: {
    now?: string | number | Date;
    limit?: number;
    inspirationLimit?: number;
  } = {},
): CookNowResult {
  const now = opts.now ?? new Date().toISOString();
  const matches = findCookableRecipes(recipes, pantry, {
    forms: seedForms,
    edges: seedEdges,
    now,
    limit: opts.limit,
  });

  const fullyCookableCount = matches.filter((m) => m.fullyCookable).length;

  // Inspiration: re-sort for use-up prominence while keeping cookable preferred
  const inspirationPool = [...matches].sort((a, b) => {
    // Prefer any use-up signal first among cookable
    const aUse = a.useUpCount > 0 ? 1 : 0;
    const bUse = b.useUpCount > 0 ? 1 : 0;
    if (a.fullyCookable !== b.fullyCookable) {
      return a.fullyCookable ? -1 : 1;
    }
    if (aUse !== bUse) return bUse - aUse;
    if (a.useUpCount !== b.useUpCount) return b.useUpCount - a.useUpCount;
    if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
    return a.recipe.id.localeCompare(b.recipe.id);
  });

  const inspirationLimit = opts.inspirationLimit ?? 8;
  const inspiration = inspirationPool.slice(0, inspirationLimit);

  return { fullyCookableCount, matches, inspiration };
}

/** "Use up: spinach, garlic, parmesan" */
export function formatUseUpLine(
  match: CookableMatch,
  maxNames = 3,
): string | null {
  if (match.useUp.length === 0) return null;
  const names = match.useUp
    .slice(0, maxNames)
    .map((u) => ingredientDisplayName(u.ingredientId).toLowerCase());
  return `Use up: ${names.join(', ')}`;
}

export { seedForms, seedEdges };
