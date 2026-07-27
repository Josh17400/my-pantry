/**
 * Quick-consume controller — one-tap tiles, optional qty stepper, undo.
 *
 * Tiles are derived from real pantry stock (live) or an explicit demo catalog
 * when no repository is wired. Consume / undo txn paths are unchanged.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_USER_ID,
} from '../../db/constants';
import type { PantryItemView } from '../../db/types';
import {
  getDomainRepository,
  hasActiveRepository,
  usePantryStore,
} from '../../state';
import { newClientId } from '../grocery/new-id';
import {
  buildItems,
  clampConsumeQty,
  maxMultiplierForStock,
} from './derive-items';
import {
  defaultQuickPrefs,
  demoQuickPrefs,
  loadQuickPrefs,
  saveQuickPrefs,
} from './prefs';
import type { QuickConsumeEvent, QuickItem, QuickPantryLine, QuickPrefs } from './types';

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
  /** Max multiplier for an item given current stock (live); demo uses 12. */
  maxMultiplier: (item: QuickItem) => number;
};

function toPantryLines(items: PantryItemView[]): QuickPantryLine[] {
  return items.map((row) => ({
    ingredientId: row.ingredientId,
    formId: row.formId,
    ingredientName: row.ingredientName,
    formName: row.formName,
    qtyBase: row.qtyBase,
    dim: row.dim,
    updatedAt: row.updatedAt,
  }));
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

  const pantryItems = usePantryStore((s) => s.items);

  const refresh = useCallback(() => {
    setLoading(true);
    try {
      const live = hasActiveRepository();
      setMode(live ? 'live' : 'demo');
      if (live) {
        setPrefs(loadQuickPrefs());
        void usePantryStore
          .getState()
          .load()
          .then(() => {
            setError(null);
            setLoading(false);
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
          });
        return;
      }
      // Demo: load any saved prefs, but if empty fall back to demo fixtures
      // so design review still has tiles. Never invent pins in live mode.
      const loaded = loadQuickPrefs();
      setPrefs(
        loaded.pins.length > 0 || Object.keys(loaded.frequency).length > 0
          ? loaded
          : demoQuickPrefs(),
      );
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pantryLines = useMemo(
    () => toPantryLines(pantryItems),
    [pantryItems],
  );

  const items = useMemo(
    () => buildItems(mode, prefs, pantryLines),
    [mode, prefs, pantryLines],
  );

  const maxMultiplier = useCallback(
    (item: QuickItem) => {
      if (mode === 'demo') return 12;
      if (!item.consumable) return 0;
      return Math.min(
        12,
        maxMultiplierForStock(item.defaultQtyBase, item.stockQtyBase),
      );
    },
    [mode],
  );

  const setMultiplier = useCallback(
    (itemId: string, mult: number) => {
      const item = items.find((i) => i.id === itemId);
      const cap = item ? maxMultiplier(item) : 12;
      const upper = Math.max(1, cap);
      const clamped = Math.max(1, Math.min(upper, Math.round(mult)));
      setQtyMultiplier((prev) => ({ ...prev, [itemId]: clamped }));
    },
    [items, maxMultiplier],
  );

  const consume = useCallback(
    async (item: QuickItem) => {
      if (!item.consumable) {
        setError(`${item.name} is out of stock`);
        return;
      }

      const mult = qtyMultiplier[item.id] ?? 1;
      const planned = item.defaultQtyBase * mult;
      const qtyBase =
        mode === 'demo'
          ? planned
          : clampConsumeQty(planned, item.stockQtyBase);

      if (!(qtyBase > 0)) {
        setError(`Not enough ${item.name} on hand`);
        return;
      }

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
        if (hasActiveRepository()) {
          saveQuickPrefs(next);
        }
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
    [qtyMultiplier, mode],
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
        if (hasActiveRepository()) {
          saveQuickPrefs(next);
        }
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
      if (hasActiveRepository()) {
        saveQuickPrefs(next);
      }
      return next;
    });
  }, []);

  const unpin = useCallback((item: QuickItem) => {
    setPrefs((prev) => {
      const next: QuickPrefs = {
        ...prev,
        pins: prev.pins.filter((p) => p.ingredientId !== item.ingredientId),
      };
      if (hasActiveRepository()) {
        saveQuickPrefs(next);
      }
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
    maxMultiplier,
  };
}
