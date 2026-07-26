/**
 * Map core GroceryList lines ↔ persisted grocery list item rows.
 */

import type { GroceryListItemInput, GroceryListItemRow } from '../../db/types';
import type { GroceryAisleGroup, GroceryList, GroceryListLine } from './core-grocery';
import { groupByAisle } from './core-grocery';

const UNMERGED_PREFIX = '⚠';

export function lineToItemInput(
  line: GroceryListLine,
  sortOrder: number,
  checked = false,
): GroceryListItemInput {
  const noteParts: string[] = [];
  if (line.unmerged) {
    noteParts.push(
      `${UNMERGED_PREFIX} ${line.unmergedReason ?? 'Could not merge units — kept separate'}`,
    );
  }
  for (const n of line.notes) {
    if (n) noteParts.push(n);
  }

  return {
    id: line.id,
    ingredientId: line.ingredientId ?? null,
    formId: line.formId ?? null,
    name: line.name,
    category: line.category,
    qtyBase: line.qtyBase,
    dim: line.dim,
    displayQty: line.displayQty,
    sources: [...line.sources],
    recipeIds: [...line.recipeIds],
    checked,
    sortOrder,
    notes: noteParts.length > 0 ? noteParts.join(' · ') : null,
  };
}

export function coreListToItemInputs(
  list: GroceryList,
  previousChecked?: ReadonlyMap<string, boolean>,
): GroceryListItemInput[] {
  return list.lines.map((line, i) =>
    lineToItemInput(line, i, previousChecked?.get(line.id) ?? false),
  );
}

export function isUnmergedItem(item: GroceryListItemRow): boolean {
  return Boolean(item.notes?.startsWith(UNMERGED_PREFIX));
}

export type AisleGroupView = {
  aisle: string;
  items: GroceryListItemRow[];
};

/** Group persisted items by category (aisle), preserving sortOrder. */
export function groupItemsByAisle(
  items: readonly GroceryListItemRow[],
): AisleGroupView[] {
  const map = new Map<string, GroceryListItemRow[]>();
  for (const item of items) {
    const aisle = item.category || 'Other';
    const list = map.get(aisle);
    if (list) list.push(item);
    else map.set(aisle, [item]);
  }

  const aisles = [...map.keys()].sort((a, b) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });

  return aisles.map((aisle) => ({
    aisle,
    items: (map.get(aisle) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

/** Prefer core byAisle when still in memory; else group rows. */
export function aisleGroupsFromCore(list: GroceryList): GroceryAisleGroup[] {
  return list.byAisle.length > 0 ? [...list.byAisle] : groupByAisle(list.lines);
}
