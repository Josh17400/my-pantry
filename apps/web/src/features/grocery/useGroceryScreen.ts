/**
 * Grocery screen controller: build list from core sources, optimistic check-off,
 * end-of-trip purchase txns with shoppingTripId, reorder one-tap add.
 */

import type { Dimension } from '@larder/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_USER_ID,
} from '../../db/constants';
import type { GroceryListItemRow } from '../../db/types';
import {
  getDomainRepository,
  hasActiveRepository,
  useGroceryStore,
  usePantryStore,
} from '../../state';
import {
  manualAddSource,
  type ReorderDetail,
} from './build-sources';
import {
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
import { rebuildLiveGroceryList } from './rebuild-live-list';

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

export function useGroceryScreen(): GroceryScreenState {
  // Subscribe to errors + pantryRevision only — never `items` (avoids rebuild loops).
  const groceryError = useGroceryStore((s) => s.error);
  const pantryError = usePantryStore((s) => s.error);
  const pantryRevision = usePantryStore((s) => s.pantryRevision);

  const [mode, setMode] = useState<GroceryScreenMode>('live');
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
  /** Last pantryRevision we already rebuilt for (skip no-op re-entry). */
  const lastBuiltRevisionRef = useRef<number | null>(null);
  /** In-flight / queued rebuild guard — concurrent refresh collapses to one. */
  const rebuildInFlightRef = useRef(false);
  const rebuildQueuedRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    shoppingTripIdRef.current = shoppingTripId;
  }, [shoppingTripId]);

  const buildLive = useCallback(async (): Promise<void> => {
    // Rebuild reads domain directly. It must never call usePantryStore load /
    // appendTxn / upsert — those bump pantryRevision and would recurse.
    const domain = getDomainRepository();
    const householdId =
      useGroceryStore.getState().householdId || DEFAULT_HOUSEHOLD_ID;

    const result = await rebuildLiveGroceryList({
      domain,
      householdId,
      manualSources: manualSourcesRef.current,
      prevItems: itemsRef.current,
      shoppingTripId: shoppingTripIdRef.current,
    });

    setReorderPending(result.reorderPending);
    setMode('live');
    setShoppingTripId(result.list.shoppingTripId);
    setItems(result.items);
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
    // Collapse concurrent refresh calls (revision + focus + mount) into a
    // single in-flight rebuild plus at most one follow-up.
    if (rebuildInFlightRef.current) {
      rebuildQueuedRef.current = true;
      return;
    }
    rebuildInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      do {
        rebuildQueuedRef.current = false;
        if (hasActiveRepository()) {
          await buildLive();
          // Snapshot revision after build — rebuild itself never bumps it.
          lastBuiltRevisionRef.current =
            usePantryStore.getState().pantryRevision;
        } else if (import.meta.env.DEV) {
          // Demo list only for local design review — production first-run is empty.
          buildDemo();
        } else {
          setMode('live');
          setItems([]);
          setShoppingTripId(null);
          setReorderPending([]);
          setError(null);
        }
      } while (rebuildQueuedRef.current);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Never fall back to fabricated groceries outside DEV.
      if (import.meta.env.DEV) {
        try {
          buildDemo();
          setError(`Live data unavailable — showing demo. (${msg})`);
        } catch (demoErr) {
          setError(
            demoErr instanceof Error ? demoErr.message : String(demoErr),
          );
        }
      } else {
        setMode('live');
        setItems([]);
        setShoppingTripId(null);
        setReorderPending([]);
        setError(msg);
      }
    } finally {
      rebuildInFlightRef.current = false;
      setLoading(false);
    }
  }, [buildDemo, buildLive]);

  // Mount / remount — always current when opening Lists.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live stock: rebuild when pantryRevision advances (not on first paint —
  // mount effect already refreshed at the current revision).
  useEffect(() => {
    if (lastBuiltRevisionRef.current === null) {
      // Mount refresh owns the first build; just record baseline.
      lastBuiltRevisionRef.current = pantryRevision;
      return;
    }
    if (lastBuiltRevisionRef.current === pantryRevision) return;
    void refresh();
  }, [pantryRevision, refresh]);

  // App / tab focus — returning from elsewhere must not require Refresh.
  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
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
