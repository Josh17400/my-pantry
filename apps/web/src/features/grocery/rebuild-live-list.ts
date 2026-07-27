/**
 * Pure-ish live grocery rebuild used by the screen and by tests.
 * Reads pantry + active list from the domain — never touches usePantryStore,
 * so it cannot bump pantryRevision and cannot recurse.
 *
 * Recipe shortfalls are never planned from the full catalogue. Only
 * user-requested recipe lines (already on the list) are re-fed as sources.
 */

import type { PantryTxn } from '@larder/core';

import {
  seedEdges,
  seedForms,
  seedIngredients,
} from '../../../../../packages/core/src/seed/index.ts';
import type { DomainRepository } from '../../db/domain-repository';
import type { GroceryListItemRow, GroceryListView, PantryItemView } from '../../db/types';
import {
  intentSourcesFromListItems,
  manualAddSource,
  mergeGrocerySources,
  type ReorderDetail,
  reorderFromPurchaseHistory,
  stockSourcesFromPantry,
} from './build-sources';
import {
  buildList,
  type GrocerySource,
} from './core-grocery';
import { coreListToItemInputs } from './map-list';
import {
  applyCheckedToInputs,
  type CheckableLine,
  mergeCheckedMap,
} from './merge-list-state';
import { newClientId } from './new-id';

function seedIngredientModels() {
  return seedIngredients.map((ing) => ({
    id: ing.id,
    name: ing.name,
    category: ing.category,
    allergens: ing.allergens,
    dietaryFlags: ing.dietaryFlags,
    isStaple: ing.isStaple,
    defaultFormId: ing.defaultFormId,
  }));
}

export type RebuildLiveListInput = {
  domain: DomainRepository;
  householdId: string;
  /**
   * Session-only sources (manual form, reorder one-tap) kept in the screen ref.
   * Persisted manual/recipe rows are rehydrated from the active list.
   */
  manualSources?: readonly GrocerySource[];
  /** In-memory rows (check-off state to preserve). */
  prevItems?: readonly CheckableLine[];
  /** Optional trip id when creating a new list. */
  shoppingTripId?: string | null;
  now?: Date;
};

export type RebuildLiveListResult = {
  list: GroceryListView;
  items: GroceryListItemRow[];
  /** Ingredients currently evaluated as stock-out. */
  stockOutIngredientIds: string[];
  /** Reorder suggestions whose ingredients appear on the list. */
  reorderPending: ReorderDetail[];
};

/**
 * Build or replace the active grocery list from current pantry projection.
 * Does not read or write the Zustand pantry store.
 */
export async function rebuildLiveGroceryList(
  input: RebuildLiveListInput,
): Promise<RebuildLiveListResult> {
  const {
    domain,
    householdId,
    manualSources = [],
    prevItems = [],
    shoppingTripId: tripHint = null,
  } = input;
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const pantryItems: PantryItemView[] =
    await domain.listPantryItems(householdId);

  // Active list first — user-requested recipe/manual lines live here.
  let existing = await domain.getActiveGroceryList(householdId);

  const txnsByIngredient = new Map<string, readonly PantryTxn[]>();
  const uniqueIngredients = new Set(pantryItems.map((p) => p.ingredientId));
  for (const id of uniqueIngredients) {
    const txns = await domain.listTxnsForIngredient(id, householdId);
    txnsByIngredient.set(id, txns);
  }

  const stockSources = stockSourcesFromPantry(pantryItems);
  const { sources: reorderSources, details: reorderDetails } =
    reorderFromPurchaseHistory(pantryItems, txnsByIngredient, now.getTime());

  // User intent: previously added recipe shortfalls + manuals on the list,
  // plus any session-only sources (manual form / reorder tap via param).
  // Never listRecipes() / plan the catalogue — that floods the list.
  const intentSources = mergeGrocerySources(
    intentSourcesFromListItems(existing?.items ?? []),
    manualSources,
  );

  const sources: GrocerySource[] = [
    ...stockSources,
    ...reorderSources,
    ...intentSources,
  ];

  const stockOutIngredientIds = stockSources
    .filter((s) => s.kind === 'stock-out' && Boolean(s.ingredientId))
    .map((s) => s.ingredientId!);

  if (!existing) {
    const tripId = tripHint ?? newClientId('trip');
    const built = buildList({
      sources,
      shoppingTripId: tripId,
      now: nowIso,
      forms: seedForms,
      edges: seedEdges,
      ingredients: seedIngredientModels(),
      locale: 'us',
    });
    const checked = mergeCheckedMap(prevItems);
    const itemInputs = applyCheckedToInputs(
      coreListToItemInputs(built),
      checked,
    );
    existing = await domain.createGroceryList({
      householdId,
      shoppingTripId: built.shoppingTripId,
      items: itemInputs,
    });
  } else {
    const built = buildList({
      sources,
      shoppingTripId: existing.shoppingTripId,
      now: nowIso,
      forms: seedForms,
      edges: seedEdges,
      ingredients: seedIngredientModels(),
      locale: 'us',
    });
    const checked = mergeCheckedMap(prevItems, existing.items);
    const itemInputs = applyCheckedToInputs(
      coreListToItemInputs(built),
      checked,
    );
    const updated = await domain.updateGroceryListItems(
      existing.id,
      itemInputs,
    );
    existing = updated ?? existing;
  }

  const onList = new Set(
    existing.items
      .map((i) => i.ingredientId)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    list: existing,
    items: existing.items,
    stockOutIngredientIds,
    reorderPending: reorderDetails.filter((d) => onList.has(d.ingredientId)),
  };
}

/** Re-export for tests that seed a manual line without going through the hook. */
export { manualAddSource };
