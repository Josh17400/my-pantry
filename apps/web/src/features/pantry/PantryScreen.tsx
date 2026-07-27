import { DEFAULT_LOW_THRESHOLD_PCT } from '@larder/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useLocations, usePantry } from '../../state';
import { hasActiveRepository } from '../../state';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { AddItemSheet } from './components/AddItemSheet';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from './components/AsyncState';
import { PantryItemRow } from './components/PantryItemRow';
import { UndoToast } from './components/UndoToast';
import { VirtualList } from './components/VirtualList';
import { useUndoStack } from './hooks/useUndoStack';
import {
  expandLocationScope,
  filterPantryItems,
  type FlatRow,
  flattenGroups,
  groupByLocation,
  type PantryFilter,
} from './lib/filter-group';
import { buildPurchaseTxn } from './lib/txn-builders';

const FILTERS: { value: PantryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'low', label: 'Low' },
  { value: 'out', label: 'Out' },
  { value: 'expiring', label: 'Expiring' },
];

const HEADER_H = 40;
const ITEM_H = 72;

export type PantryScreenProps = {
  /** Injected for preview / tests */
  nowMs?: number;
};

/**
 * Pantry list — grouped by location, searchable, filterable, virtualized.
 */
export function PantryScreen({ nowMs }: PantryScreenProps) {
  const [searchParams] = useSearchParams();
  const locationFilter = searchParams.get('location');

  const {
    items,
    loading,
    error,
    load,
    appendTxn,
    upsert,
    clearError,
    householdId,
  } = usePantry();
  const {
    locations,
    list: listLocations,
    loading: locLoading,
    error: locError,
  } = useLocations();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PantryFilter>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const { undo, offerUndo, performUndo, dismiss } = useUndoStack(appendTxn);

  const refresh = useCallback(async () => {
    clearError();
    await Promise.all([load(), listLocations()]);
  }, [clearError, load, listLocations]);

  useEffect(() => {
    if (!hasActiveRepository()) return;
    void refresh();
  }, [refresh]);

  // Parent scope includes children (Pantry → Spices / Baking / …)
  const locationScopeIds = useMemo(() => {
    if (!locationFilter) return null;
    return expandLocationScope(locationFilter, locations);
  }, [locationFilter, locations]);

  const locationTitle = useMemo(() => {
    if (!locationFilter) return null;
    return locations.find((l) => l.id === locationFilter)?.name ?? null;
  }, [locationFilter, locations]);

  const filtered = useMemo(() => {
    let pool = items;
    if (locationScopeIds) {
      pool = pool.filter(
        (i) => i.locationId != null && locationScopeIds.has(i.locationId),
      );
    }
    return filterPantryItems(pool, { query, filter, nowMs });
  }, [items, query, filter, nowMs, locationScopeIds]);

  const flatRows = useMemo(() => {
    const groups = groupByLocation(filtered, locations);
    return flattenGroups(groups);
  }, [filtered, locations]);

  const getRowHeight = useCallback((row: FlatRow) => {
    return row.kind === 'header' ? HEADER_H : ITEM_H;
  }, []);

  async function handleAdd(input: {
    ingredientId: string;
    formId: string;
    qtyBase: number;
    dim: 'mass' | 'volume' | 'count';
    locationId: string;
    ingredientName: string;
  }) {
    setActionBusy(true);
    try {
      const previous = items.find(
        (i) =>
          i.ingredientId === input.ingredientId && i.formId === input.formId,
      );
      const previousQty = previous?.qtyBase ?? 0;

      await upsert({
        householdId,
        ingredientId: input.ingredientId,
        formId: input.formId,
        locationId: input.locationId,
        qtyBase: previousQty,
        dim: input.dim,
        parLevelBase: previous?.parLevelBase ?? input.qtyBase,
        lowThresholdPct: previous?.lowThresholdPct ?? DEFAULT_LOW_THRESHOLD_PCT,
      });

      const txn = buildPurchaseTxn(
        { ingredientId: input.ingredientId, formId: input.formId },
        input.qtyBase,
        { householdId },
      );
      await appendTxn(txn);

      offerUndo(`Added ${input.ingredientName}`, {
        label: 'add',
        previousQtyBase: previousQty,
        original: txn,
      });
      setAddOpen(false);
    } finally {
      setActionBusy(false);
    }
  }

  const repoReady = hasActiveRepository();
  const showLoading = repoReady && loading && items.length === 0;
  const showError = Boolean(error || locError);

  return (
    <div className="relative flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-bg">
      <header className="shrink-0 px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-ink">
              {locationTitle ?? 'Pantry'}
            </h1>
            {locationTitle ? (
              <Link
                to="/pantry"
                className="text-xs font-medium text-primary"
              >
                All locations
              </Link>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {repoReady ? (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                data-testid="pantry-header-add"
                className="min-h-tap shrink-0 rounded-pill bg-primary px-3 text-sm font-semibold text-white"
              >
                Add
              </button>
            ) : null}
            <Link
              to="/locations"
              className="min-h-tap shrink-0 rounded-pill px-3 text-sm font-medium text-primary"
            >
              Locations
            </Link>
          </div>
        </div>

        <label className="sr-only" htmlFor="pantry-search">
          Search pantry
        </label>
        <input
          id="pantry-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items…"
          className="mb-3 min-h-tap w-full rounded-2xl border border-black/[0.06] bg-surface px-3 text-base text-ink placeholder:text-ink-muted/70 shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />

        <SegmentedControl
          aria-label="Filter pantry"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
        />
      </header>

      <div className="min-h-0 flex-1 px-4">
        {!repoReady ? (
          <EmptyBlock
            title="Pantry unavailable"
            body="The data layer is not connected on this surface yet. On native, the pantry loads after the local database boots."
          />
        ) : showLoading || locLoading && items.length === 0 ? (
          <LoadingBlock label="Loading pantry…" />
        ) : showError ? (
          <ErrorBlock
            message={error ?? locError ?? 'Unknown error'}
            onRetry={() => void refresh()}
          />
        ) : items.length === 0 ? (
          <EmptyBlock
            title="Your pantry is empty"
            body="That's the normal first-run state. Add what you have on hand — a purchase on the ledger starts the trail of trust."
            action={
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="min-h-tap w-full rounded-pill bg-primary px-4 text-sm font-semibold text-white"
              >
                Add your first item
              </button>
            }
          />
        ) : flatRows.length === 0 ? (
          <EmptyBlock
            title="No matches"
            body={
              filter === 'all'
                ? 'Nothing matches that search.'
                : `No items are currently “${filter}”.`
            }
            action={
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
                className="min-h-tap w-full rounded-pill bg-bg px-4 text-sm font-semibold text-ink"
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <VirtualList
            items={flatRows}
            rowHeight={ITEM_H}
            getRowHeight={getRowHeight}
            className="h-[calc(100dvh-12.5rem)]"
            aria-label="Pantry items by location"
            renderRow={(row) => {
              if (row.kind === 'header') {
                return (
                  <div className="flex h-full items-end justify-between px-1 pb-1">
                    <h2 className="font-display text-lg font-semibold text-ink">
                      {row.title}
                    </h2>
                    <span className="text-xs text-ink-muted">
                      {row.count} {row.count === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                );
              }
              return (
                <div className="px-0.5 py-1">
                  <PantryItemRow item={row.item} nowMs={nowMs} />
                </div>
              );
            }}
          />
        )}
      </div>

      <AddItemSheet
        open={addOpen}
        locations={locations}
        onClose={() => setAddOpen(false)}
        onConfirm={handleAdd}
        busy={actionBusy}
        defaultLocationId={locations.find((l) => !l.parentId)?.id}
      />

      {undo ? (
        <UndoToast
          message={undo.message}
          onUndo={() => void performUndo()}
          onDismiss={dismiss}
        />
      ) : null}
    </div>
  );
}
