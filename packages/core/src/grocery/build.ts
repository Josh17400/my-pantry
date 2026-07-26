/**
 * buildList — merge manual adds, stock low/out, recipe shortfalls, reorder
 * suggestions into one aisle-grouped grocery list with a shoppingTripId.
 */

import type { Ingredient } from '../domain/types';
import type { AggregateContext } from './aggregate';
import { aggregateSources, groupByAisle } from './aggregate';
import type { BuildListOptions, GroceryList } from './types';

function mapsFromIngredients(ingredients: readonly Ingredient[] | undefined): {
  nameById: Map<string, string>;
  categoryById: Map<string, string>;
} {
  const nameById = new Map<string, string>();
  const categoryById = new Map<string, string>();
  if (ingredients) {
    for (const ing of ingredients) {
      nameById.set(ing.id, ing.name);
      categoryById.set(ing.id, ing.category);
    }
  }
  return { nameById, categoryById };
}

/**
 * Build a grocery list from heterogeneous sources.
 * Pure — no I/O; `now` and `shoppingTripId` are caller-supplied.
 */
export function buildList(opts: BuildListOptions): GroceryList {
  if (!opts.shoppingTripId) {
    throw new RangeError('shoppingTripId is required');
  }
  if (!opts.now) {
    throw new RangeError('now is required (injected clock)');
  }

  const { nameById, categoryById } = mapsFromIngredients(opts.ingredients);

  const ctx: AggregateContext = {
    forms: opts.forms ?? [],
    edges: opts.edges ?? [],
    nameById,
    categoryById,
    locale: opts.locale,
  };

  const lines = aggregateSources(opts.sources, ctx);
  const byAisle = groupByAisle(lines);

  return {
    shoppingTripId: opts.shoppingTripId,
    lines,
    byAisle,
    createdAt: opts.now,
  };
}
