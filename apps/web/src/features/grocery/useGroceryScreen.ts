/**
 * Grocery screen controller: build list from core sources, optimistic check-off,
 * end-of-trip purchase txns with shoppingTripId, reorder one-tap add.
 */

import type { Dimension, PantryTxn } from '@larder/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  seedEdges,
  seedForms,
  seedIngredients,
} from '../../../../../packages/core/src/seed/index.ts';
import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_USER_ID,
} from '../../db/constants';
import type { GroceryListItemRow, PantryItemView } from '../../db/types';
import {
  getDomainRepository,
  hasActiveRepository,
  useGroceryStore,
  usePantryStore,
} from '../../state';
import {
  manualAddSource,
  recipeShortfallSources,
  type ReorderDetail,
  reorderFromPurchaseHistory,
  stockSourcesFromPantry,
} from './build-sources';
import {
  buildList,
  type GroceryList,
  type GrocerySource,
} from './core-grocery';
import { buildDemoGroceryList } from './demo-data';
import {
  type AisleGroupView,
  coreListToItemInputs,
  groupItemsByAisle,
} from './map-list';
import { newClientId } from './new-id';

export type GroceryScreenMode = 'live' | 'demo';

export type GroceryScreenState = {
  mode: GroceryScreenMode;
  loading: boolean;
  error: string | null;
  shoppingTripId: string | null;
  items: GroceryListItemRow[];
  aisleGroups: AisleGroupView[];
  checkedCount: number;
  totalCount: number;
  reorderPending: ReorderDetail[];
  tripCommitting: boolean;
  tripMessage: string | null;
  refresh: () => Promise<void>;
  toggleCheck: (itemId: string) => Promise<void>;
  addReorder: (detail: ReorderDetail) => Promise<void>;
  addManual: (name: string) => Promise<void>;
  endTrip: () => Promise<void>;
  clearTripMessage: () => void;
  clearError: () => void;
};

function toRows(
  list: GroceryList,
  checked: ReadonlyMap<string, boolean>,
  listId: string,
  shoppingTripId: string,
): GroceryListItemRow[] {
  return coreListToItemInputs(list, checked).map((input, i) => ({
    id: input.id ?? `line-${i}`,
    listId,
    shoppingTripId,
    ingredientId: input.ingredientId ?? null,
    formId: input.formId ?? null,
    name: input.name,
    category: input.category,
    qtyBase: input.qtyBase ?? null,
    dim: (input.dim as Dimension | null) ?? null,
    displayQty: input.displayQty,
    sources: [...(input.sources ?? ['manual'])],
    recipeIds: [...(input.recipeIds ?? [])],
    checked: input.checked ?? false,
    sortOrder: input.sortOrder ?? i,
    notes: input.notes ?? null,
  }));
}

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

function seedNameMaps(): {
  names: Map<string, string>;
  categories: Map<string, string>;
} {
  const names = new Map<string, string>();
  const categories = new Map<string, string>();
  for (const ing of seedIngredients) {
    names.set(ing.id, ing.name);
    categories.set(ing.id, ing.category);
  }
  return { names, categories };
}

export function useGroceryScreen(): GroceryScreenState {
  // Subscribe only to error fields so store updates don't loop refresh
  const groceryError = useGroceryStore((s) => s.error);
  const pantryError = usePantryStore((s) => s.error);

  const [mode, setMode] = useState<GroceryScreenMode>('demo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GroceryListItemRow[]>([]);
  const [shoppingTripId, setShoppingTripId] = useState<string | null>(null);
  const [reorderPending, setReorderPending] = useState<ReorderDetail[]>([]);
  const [tripCommitting, setTripCommitting] = useState(false);
  const [tripMessage, setTripMessage] = useState<string | null>(null);

  const manualSourcesRef = useRef<GrocerySource[]>([]);
  const itemsRef = useRef<GroceryListItemRow[]>([]);
  const shoppingTripIdRef = useRef<string | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    shoppingTripIdRef.current = shoppingTripId;
  }, [shoppingTripId]);

  const buildLive = useCallback(async (): Promise<void> => {
    const domain = getDomainRepository();
    const householdId =
      useGroceryStore.getState().householdId || DEFAULT_HOUSEHOLD_ID;

    const pantryItems: PantryItemView[] =
      await domain.listPantryItems(householdId);
    const recipeSummaries = await domain.listRecipes(householdId);

    const recipeDetails = [];
    for (const s of recipeSummaries) {
      const d = await domain.getRecipe(s.id);
      if (d) recipeDetails.push(d);
    }

    const { names, categories } = seedNameMaps();
    const now = new Date();
    const nowIso = now.toISOString();

    const txnsByIngredient = new Map<string, readonly PantryTxn[]>();
    const uniqueIngredients = new Set(
      pantryItems.map((p) => p.ingredientId),
    );
    for (const id of uniqueIngredients) {
      const txns = await domain.listTxnsForIngredient(id, householdId);
      txnsByIngredient.set(id, txns);
    }

    const stockSources = stockSourcesFromPantry(pantryItems);
    const { sources: reorderSources, details: reorderDetails } =
      reorderFromPurchaseHistory(pantryItems, txnsByIngredient, now.getTime());

    const shortfallSources = recipeShortfallSources(
      recipeDetails,
      pantryItems,
      seedForms,
      seedEdges,
      names,
      categories,
    );

    const sources: GrocerySource[] = [
      ...stockSources,
      ...reorderSources,
      ...shortfallSources,
      ...manualSourcesRef.current,
    ];

    const prevItems = itemsRef.current;
    const nameChecked = new Map(
      prevItems
        .filter((r) => r.checked)
        .map((r) => [`${r.ingredientId ?? r.name}|${r.formId ?? ''}`, true]),
    );

    let existing = await domain.getActiveGroceryList(householdId);
    let tripId = existing?.shoppingTripId ?? shoppingTripIdRef.current;

    if (!existing) {
      tripId = newClientId('trip');
      const built = buildList({
        sources,
        shoppingTripId: tripId,
        now: nowIso,
        forms: seedForms,
        edges: seedEdges,
        ingredients: seedIngredientModels(),
        locale: 'us',
      });
      const created = await domain.createGroceryList({
        householdId,
        shoppingTripId: built.shoppingTripId,
        items: coreListToItemInputs(built),
      });
      existing = created;
      tripId = created.shoppingTripId;
    } else {
      tripId = existing.shoppingTripId;
      const built = buildList({
        sources,
        shoppingTripId: tripId,
        now: nowIso,
        forms: seedForms,
        edges: seedEdges,
        ingredients: seedIngredientModels(),
        locale: 'us',
      });

      for (const row of existing.items) {
        if (row.checked) {
          nameChecked.set(
            `${row.ingredientId ?? row.name}|${row.formId ?? ''}`,
            true,
          );
        }
      }

      const inputs = coreListToItemInputs(built).map((input) => {
        const key = `${input.ingredientId ?? input.name}|${input.formId ?? ''}`;
        return { ...input, checked: nameChecked.get(key) === true };
      });

      const updated = await domain.updateGroceryListItems(existing.id, inputs);
      existing = updated ?? existing;
    }

    const onList = new Set(
      existing.items
        .map((i) => i.ingredientId)
        .filter((id): id is string => Boolean(id)),
    );

    setReorderPending(
      reorderDetails.filter((d) => onList.has(d.ingredientId)),
    );
    setMode('live');
    setShoppingTripId(existing.shoppingTripId);
    setItems(existing.items);
    setError(null);
  }, []);

  const buildDemo = useCallback((): void => {
    const { list } = buildDemoGroceryList();
    const prevChecked = new Map(
      itemsRef.current
        .filter((i) => i.checked)
        .map((i) => [i.id, true] as const),
    );
    const rows = toRows(list, prevChecked, 'demo-list', list.shoppingTripId);
    setMode('demo');
    setShoppingTripId(list.shoppingTripId);
    setItems(rows);
    setReorderPending(
      list.lines
        .filter((l) => l.sources.includes('reorder'))
        .map((l) => ({
          ingredientId: l.ingredientId ?? l.id,
          formId: l.formId ?? '',
          suggestedQtyBase: l.qtyBase ?? 1,
          dim: (l.dim ?? 'count') as Dimension,
          name: l.name,
          category: l.category,
          cadenceDays: 5,
          daysSinceLast: 6,
          lastBoughtAt: new Date().toISOString(),
          note:
            l.notes.find((n) => n.toLowerCase().includes('usually')) ??
            l.notes[0] ??
            'Reorder suggestion',
        })),
    );
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (hasActiveRepository()) {
        await buildLive();
      } else {
        buildDemo();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        buildDemo();
        setError(`Live data unavailable — showing demo. (${msg})`);
      } catch (demoErr) {
        setError(
          demoErr instanceof Error ? demoErr.message : String(demoErr),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [buildDemo, buildLive]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleCheck = useCallback(
    async (itemId: string) => {
      const current = itemsRef.current.find((i) => i.id === itemId);
      if (!current) return;
      const next = !current.checked;

      // Optimistic — instant in-store feel; never wait on store.loading
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, checked: next } : i)),
      );

      if (mode === 'demo' || !hasActiveRepository()) {
        return;
      }

      try {
        await useGroceryStore.getState().checkOff(itemId, next);
      } catch (err) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId ? { ...i, checked: current.checked } : i,
          ),
        );
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [mode],
  );

  const addManual = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const source = manualAddSource({ name: trimmed, category: 'other' });
      manualSourcesRef.current = [...manualSourcesRef.current, source];
      await refresh();
    },
    [refresh],
  );

  const addReorder = useCallback(
    async (detail: ReorderDetail) => {
      const exists = itemsRef.current.some(
        (i) =>
          i.ingredientId === detail.ingredientId &&
          i.formId === detail.formId,
      );
      if (exists) {
        setTripMessage(`${detail.name ?? 'Item'} is already on your list`);
        return;
      }
      manualSourcesRef.current = [
        ...manualSourcesRef.current,
        {
          kind: 'reorder',
          ingredientId: detail.ingredientId,
          formId: detail.formId,
          name: detail.name,
          category: detail.category,
          qtyBase: detail.suggestedQtyBase,
          dim: detail.dim,
          note: detail.note,
        },
      ];
      await refresh();
    },
    [refresh],
  );

  const endTrip = useCallback(async () => {
    const checked = itemsRef.current.filter((i) => i.checked);
    if (checked.length === 0) {
      setTripMessage(
        'Check off items as you shop, then add them to the pantry.',
      );
      return;
    }
    const tripId = shoppingTripIdRef.current;
    if (!tripId) {
      setTripMessage('No shopping trip id — cannot hand off to pantry.');
      return;
    }

    setTripCommitting(true);
    setTripMessage(null);

    try {
      if (mode === 'demo' || !hasActiveRepository()) {
        setTripMessage(
          `Demo: would add ${checked.length} item(s) as purchase txns with shoppingTripId=${tripId}`,
        );
        setItems((prev) => prev.filter((i) => !i.checked));
        return;
      }

      const domain = getDomainRepository();
      const householdId =
        useGroceryStore.getState().householdId || DEFAULT_HOUSEHOLD_ID;
      const now = new Date().toISOString();
      let written = 0;

      for (const item of checked) {
        if (
          !item.ingredientId ||
          !item.formId ||
          item.qtyBase === null ||
          item.qtyBase === undefined
        ) {
          continue;
        }
        await domain.appendTxn({
          clientTxnId: newClientId('purchase'),
          householdId,
          ingredientId: item.ingredientId,
          formId: item.formId,
          kind: 'relative',
          reason: 'purchase',
          deltaBase: item.qtyBase,
          // M2 receipt reconciliation matches against this trip id
          refId: tripId,
          occurredAt: now,
          deviceId: DEFAULT_DEVICE_ID,
          userId: DEFAULT_USER_ID,
        });
        written += 1;
      }

      setTripMessage(
        `Added ${written} item(s) to pantry (trip ${tripId.slice(0, 12)}…)`,
      );
      await usePantryStore.getState().load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTripCommitting(false);
    }
  }, [mode]);

  const aisleGroups = useMemo(() => groupItemsByAisle(items), [items]);
  const checkedCount = useMemo(
    () => items.filter((i) => i.checked).length,
    [items],
  );

  return {
    mode,
    loading,
    error: error ?? groceryError ?? pantryError,
    shoppingTripId,
    items,
    aisleGroups,
    checkedCount,
    totalCount: items.length,
    reorderPending,
    tripCommitting,
    tripMessage,
    refresh,
    toggleCheck,
    addReorder,
    addManual,
    endTrip,
    clearTripMessage: () => setTripMessage(null),
    clearError: () => {
      setError(null);
      useGroceryStore.getState().clearError();
      usePantryStore.getState().clearError();
    },
  };
}
