/**
 * Quick-consume controller — one-tap tiles, optional qty stepper, undo.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_USER_ID,
} from '../../db/constants';
import {
  getDomainRepository,
  hasActiveRepository,
  usePantryStore,
} from '../../state';
import { newClientId } from '../grocery/new-id';
import {
  defaultQuickPrefs,
  loadQuickPrefs,
  saveQuickPrefs,
  SUGGESTED_CATALOG,
} from './prefs';
import type { QuickConsumeEvent, QuickItem, QuickPrefs } from './types';

export type QuickScreenState = {
  loading: boolean;
  error: string | null;
  items: QuickItem[];
  /** itemId → pending consume qty (stepper). Default 1× defaultQtyBase. */
  qtyMultiplier: Record<string, number>;
  lastConsume: QuickConsumeEvent | null;
  undoBusy: boolean;
  mode: 'live' | 'demo';
  setMultiplier: (itemId: string, mult: number) => void;
  consume: (item: QuickItem) => Promise<void>;
  undoLast: () => Promise<void>;
  pin: (item: QuickItem) => void;
  unpin: (item: QuickItem) => void;
  refresh: () => void;
  clearError: () => void;
  clearLast: () => void;
};

function buildItems(prefs: QuickPrefs): QuickItem[] {
  const pinnedIds = new Set(prefs.pins.map((p) => p.ingredientId));
  const pinned: QuickItem[] = prefs.pins.map((p) => ({
    id: `pin-${p.ingredientId}-${p.formId}`,
    ingredientId: p.ingredientId,
    formId: p.formId,
    name: p.name,
    defaultQtyBase: p.defaultQtyBase,
    dim: p.dim,
    origin: 'pinned' as const,
    frequency: prefs.frequency[p.ingredientId] ?? 0,
  }));

  const suggested: QuickItem[] = SUGGESTED_CATALOG.filter(
    (s) => !pinnedIds.has(s.ingredientId),
  )
    .map((s) => ({
      id: `sug-${s.ingredientId}-${s.formId}`,
      ingredientId: s.ingredientId,
      formId: s.formId,
      name: s.name,
      defaultQtyBase: s.defaultQtyBase,
      dim: s.dim,
      origin: 'suggested' as const,
      frequency: prefs.frequency[s.ingredientId] ?? 0,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 4);

  return [...pinned, ...suggested];
}

export function useQuickItems(): QuickScreenState {
  const [prefs, setPrefs] = useState<QuickPrefs>(() => defaultQuickPrefs());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qtyMultiplier, setQtyMultiplier] = useState<Record<string, number>>(
    {},
  );
  const [lastConsume, setLastConsume] = useState<QuickConsumeEvent | null>(
    null,
  );
  const [undoBusy, setUndoBusy] = useState(false);
  const [mode, setMode] = useState<'live' | 'demo'>('demo');

  const refresh = useCallback(() => {
    setLoading(true);
    try {
      const loaded = loadQuickPrefs();
      setPrefs(loaded);
      setMode(hasActiveRepository() ? 'live' : 'demo');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const items = useMemo(() => buildItems(prefs), [prefs]);

  const setMultiplier = useCallback((itemId: string, mult: number) => {
    const clamped = Math.max(1, Math.min(12, Math.round(mult)));
    setQtyMultiplier((prev) => ({ ...prev, [itemId]: clamped }));
  }, []);

  const consume = useCallback(
    async (item: QuickItem) => {
      const mult = qtyMultiplier[item.id] ?? 1;
      const qtyBase = item.defaultQtyBase * mult;
      const clientTxnId = newClientId('quick');
      const occurredAt = new Date().toISOString();
      const householdId =
        usePantryStore.getState().householdId || DEFAULT_HOUSEHOLD_ID;

      // Optimistic frequency bump
      setPrefs((prev) => {
        const next: QuickPrefs = {
          ...prev,
          frequency: {
            ...prev.frequency,
            [item.ingredientId]: (prev.frequency[item.ingredientId] ?? 0) + 1,
          },
          recentClientTxnIds: [clientTxnId, ...prev.recentClientTxnIds].slice(
            0,
            20,
          ),
        };
        saveQuickPrefs(next);
        return next;
      });

      const event: QuickConsumeEvent = {
        id: clientTxnId,
        item,
        qtyBase,
        clientTxnId,
        occurredAt,
        committed: false,
      };
      setLastConsume(event);
      setError(null);

      if (!hasActiveRepository()) {
        setLastConsume({ ...event, committed: true });
        setMode('demo');
        // Reset multiplier to 1 after consume (common case stays one tap)
        setQtyMultiplier((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        return;
      }

      try {
        await getDomainRepository().appendTxn({
          clientTxnId,
          householdId,
          ingredientId: item.ingredientId,
          formId: item.formId,
          kind: 'relative',
          reason: 'quick',
          // Consumption is negative delta
          deltaBase: -Math.abs(qtyBase),
          occurredAt,
          deviceId: DEFAULT_DEVICE_ID,
          userId: DEFAULT_USER_ID,
        });
        setLastConsume({ ...event, committed: true });
        setMode('live');
        await usePantryStore.getState().load();
        setQtyMultiplier((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLastConsume(null);
        // Roll back frequency
        setPrefs((prev) => {
          const next: QuickPrefs = {
            ...prev,
            frequency: {
              ...prev.frequency,
              [item.ingredientId]: Math.max(
                0,
                (prev.frequency[item.ingredientId] ?? 1) - 1,
              ),
            },
          };
          saveQuickPrefs(next);
          return next;
        });
      }
    },
    [qtyMultiplier],
  );

  const undoLast = useCallback(async () => {
    if (!lastConsume || undoBusy) return;
    setUndoBusy(true);
    setError(null);
    try {
      const { item, qtyBase, clientTxnId } = lastConsume;
      const undoTxnId = newClientId('quick-undo');
      const householdId =
        usePantryStore.getState().householdId || DEFAULT_HOUSEHOLD_ID;

      if (hasActiveRepository() && lastConsume.committed) {
        // Compensating relative txn (positive) — ledger is append-only
        await getDomainRepository().appendTxn({
          clientTxnId: undoTxnId,
          householdId,
          ingredientId: item.ingredientId,
          formId: item.formId,
          kind: 'relative',
          reason: 'adjust_delta',
          deltaBase: Math.abs(qtyBase),
          refId: clientTxnId,
          occurredAt: new Date().toISOString(),
          deviceId: DEFAULT_DEVICE_ID,
          userId: DEFAULT_USER_ID,
        });
        await usePantryStore.getState().load();
      }

      setPrefs((prev) => {
        const next: QuickPrefs = {
          ...prev,
          frequency: {
            ...prev.frequency,
            [item.ingredientId]: Math.max(
              0,
              (prev.frequency[item.ingredientId] ?? 1) - 1,
            ),
          },
        };
        saveQuickPrefs(next);
        return next;
      });
      setLastConsume(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUndoBusy(false);
    }
  }, [lastConsume, undoBusy]);

  const pin = useCallback((item: QuickItem) => {
    setPrefs((prev) => {
      if (prev.pins.some((p) => p.ingredientId === item.ingredientId)) {
        return prev;
      }
      const next: QuickPrefs = {
        ...prev,
        pins: [
          ...prev.pins,
          {
            ingredientId: item.ingredientId,
            formId: item.formId,
            name: item.name,
            defaultQtyBase: item.defaultQtyBase,
            dim: item.dim,
          },
        ],
      };
      saveQuickPrefs(next);
      return next;
    });
  }, []);

  const unpin = useCallback((item: QuickItem) => {
    setPrefs((prev) => {
      const next: QuickPrefs = {
        ...prev,
        pins: prev.pins.filter((p) => p.ingredientId !== item.ingredientId),
      };
      saveQuickPrefs(next);
      return next;
    });
  }, []);

  return {
    loading,
    error,
    items,
    qtyMultiplier,
    lastConsume,
    undoBusy,
    mode,
    setMultiplier,
    consume,
    undoLast,
    pin,
    unpin,
    refresh,
    clearError: () => setError(null),
    clearLast: () => setLastConsume(null),
  };
}
