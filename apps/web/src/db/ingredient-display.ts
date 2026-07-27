/**
 * Resolve a human ingredient title when the local catalogue join may miss.
 *
 * Manual-add writes pantry rows keyed by seed id but display historically
 * depended only on a left-join to the local `ingredients` table. On a device
 * whose catalogue predates a SEED_VERSION bump (or is otherwise stale), the
 * join returns null and the UI fell back to the raw id → "Unknown item".
 *
 * Resolution order:
 *   1. joined / denormalized catalogue name (when it is a real title)
 *   2. in-app seed catalog by id (always present in the binary)
 *   3. null — caller maps to "Unknown item" / raw id as appropriate
 */

import { seedIngredients } from '@larder/core';

const seedNameById: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const ing of seedIngredients) {
    m.set(ing.id, ing.name);
  }
  return m;
})();

/** Look up the shipping seed catalog name for an ingredient id. */
export function seedIngredientName(ingredientId: string): string | null {
  return seedNameById.get(ingredientId) ?? null;
}

/**
 * True when `name` looks like a usable product title (not a slug, uuid,
 * empty string, or a location label).
 */
export function isUsableIngredientTitle(
  name: string | null | undefined,
  ingredientId: string,
  locationName?: string | null,
): boolean {
  const n = (name ?? '').trim();
  if (!n) return false;
  if (n === ingredientId) return false;
  const loc = (locationName ?? '').trim();
  if (loc && n.toLowerCase() === loc.toLowerCase()) return false;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n)
  ) {
    return false;
  }
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(n) && n === n.toLowerCase()) {
    return false;
  }
  return true;
}

/**
 * Best available display name for a pantry row.
 * Returns null only when every source fails — UI should show "Unknown item".
 */
export function resolveIngredientTitle(input: {
  ingredientId: string;
  /** Name from local ingredients join, or denormalized cache on the row. */
  ingredientName?: string | null;
  locationName?: string | null;
}): string | null {
  const { ingredientId, ingredientName, locationName } = input;
  if (isUsableIngredientTitle(ingredientName, ingredientId, locationName)) {
    return (ingredientName ?? '').trim();
  }
  const fromSeed = seedIngredientName(ingredientId);
  if (fromSeed && isUsableIngredientTitle(fromSeed, ingredientId, locationName)) {
    return fromSeed;
  }
  return null;
}
