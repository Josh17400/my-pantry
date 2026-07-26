/**
 * findCookableRecipes — cook-now matching.
 *
 * Powers "Make something amazing — you have everything for 6 recipes".
 * Pure, deterministic, offline, free tier — not an AI feature.
 *
 * Ranking:
 *   1. Fully cookable first (missingCount === 0)
 *   2. Fewest missing items
 *   3. More ingredients expiring soon ("Use up: …")
 *   4. Stable tie-break: recipe.id lexicographic
 *
 * Complexity: O(P + Σ lines) with pantry indexed by ingredient —
 * not O(R × L × P). Suitable for ~2k recipes × ~500 pantry rows.
 */

import { indexPantryByIngredient, planCook } from './plan';
import type {
  CookableMatch,
  FindCookableOptions,
  PantryStockRow,
  Recipe,
  UseUpIngredient,
} from './types';

const DEFAULT_EXPIRY_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

export function parseNowMs(now: string | number | Date): number {
  if (typeof now === 'number') {
    if (!Number.isFinite(now)) {
      throw new RangeError(`now number is not finite: ${String(now)}`);
    }
    return now;
  }
  if (now instanceof Date) {
    const t = now.getTime();
    if (!Number.isFinite(t)) {
      throw new RangeError('now Date is invalid');
    }
    return t;
  }
  const t = Date.parse(now);
  if (!Number.isFinite(t)) {
    throw new RangeError(`now string is not a valid date: ${JSON.stringify(now)}`);
  }
  return t;
}

/**
 * Collect pantry ingredients used by the recipe (primary + substitutes)
 * that expire within [now, now + horizon].
 */
export function collectUseUp(
  recipe: Recipe,
  pantryByIng: Map<string, PantryStockRow[]>,
  nowMs: number,
  horizonMs: number,
): UseUpIngredient[] {
  const wanted = new Set<string>();
  for (const line of recipe.ingredients) {
    if (line.ingredientId) wanted.add(line.ingredientId);
    if (line.substitutes) {
      for (const s of line.substitutes) wanted.add(s);
    }
  }

  const horizonEnd = nowMs + horizonMs;
  const byIng = new Map<string, string>(); // ingredientId → earliest expiresAt ISO

  for (const ingId of wanted) {
    const rows = pantryByIng.get(ingId);
    if (!rows) continue;
    for (const row of rows) {
      if (!row.expiresAt) continue;
      const expMs = Date.parse(row.expiresAt);
      if (!Number.isFinite(expMs)) continue;
      // Include past-due and items expiring within the horizon.
      // Exclude items that expire after the horizon (still "fresh").
      if (expMs > horizonEnd) continue;

      const prev = byIng.get(ingId);
      if (!prev || Date.parse(prev) > expMs) {
        byIng.set(ingId, row.expiresAt);
      }
    }
  }

  const out: UseUpIngredient[] = [];
  for (const [ingredientId, expiresAt] of byIng) {
    out.push({ ingredientId, expiresAt });
  }
  // Stable order
  out.sort((a, b) => {
    const ta = Date.parse(a.expiresAt);
    const tb = Date.parse(b.expiresAt);
    if (ta !== tb) return ta - tb;
    return a.ingredientId.localeCompare(b.ingredientId);
  });
  return out;
}

function compareMatches(a: CookableMatch, b: CookableMatch): number {
  // 1. Fully cookable first
  if (a.fullyCookable !== b.fullyCookable) {
    return a.fullyCookable ? -1 : 1;
  }
  // 2. Fewest missing
  if (a.missingCount !== b.missingCount) {
    return a.missingCount - b.missingCount;
  }
  // 3. Prefer recipes that use expiring ingredients (higher useUpCount)
  if (a.useUpCount !== b.useUpCount) {
    return b.useUpCount - a.useUpCount;
  }
  // 4. Deterministic tie: recipe id
  return a.recipe.id.localeCompare(b.recipe.id);
}

/**
 * Rank recipes by cookability against the pantry.
 * Index pantry once; plan each recipe with O(lines) lookups.
 */
export function findCookableRecipes(
  recipes: readonly Recipe[],
  pantry: readonly PantryStockRow[],
  opts: FindCookableOptions,
): CookableMatch[] {
  const nowMs = parseNowMs(opts.now);
  const horizonMs = opts.expiryHorizonMs ?? DEFAULT_EXPIRY_HORIZON_MS;
  const pantryByIng = indexPantryByIngredient(pantry);
  const ctx = { forms: opts.forms, edges: opts.edges };

  const matches: CookableMatch[] = [];

  for (const recipe of recipes) {
    const plan = planCook(recipe, recipe.servings, pantry, ctx);
    const useUp = collectUseUp(recipe, pantryByIng, nowMs, horizonMs);
    matches.push({
      recipe,
      plan,
      fullyCookable: plan.canCook && plan.missingCount === 0,
      missingCount: plan.missingCount,
      useUp,
      useUpCount: useUp.length,
    });
  }

  matches.sort(compareMatches);

  if (opts.limit !== undefined && opts.limit >= 0) {
    return matches.slice(0, opts.limit);
  }
  return matches;
}
