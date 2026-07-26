import { useState } from 'react';

import { Card, cn } from '../../ui';
import { aisleTitle } from './aisle-title';
import { GroceryLineRow } from './GroceryLineRow';
import { useGroceryScreen } from './useGroceryScreen';

/**
 * Full grocery list screen — aisle-grouped, source-tagged, offline check-off,
 * end-of-trip pantry handoff with shoppingTripId.
 */
export function GroceryScreen() {
  const g = useGroceryScreen();
  const [manualName, setManualName] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  if (g.loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 pt-safe">
        <div
          className="h-10 w-10 animate-pulse rounded-full bg-primary/20"
          aria-hidden
        />
        <p className="text-sm text-ink-muted">Building your grocery list…</p>
      </div>
    );
  }

  if (g.error && g.totalCount === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 pt-safe">
        <p className="text-center text-sm text-critical">{g.error}</p>
        <button
          type="button"
          onClick={() => void g.refresh()}
          className="min-h-tap min-w-tap rounded-pill bg-primary px-5 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  const empty = g.totalCount === 0;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col pb-safe">
      <header className="sticky top-0 z-10 border-b border-black/[0.04] bg-bg/95 px-4 pb-3 pt-safe backdrop-blur-sm">
        <div className="flex items-end justify-between gap-3 pt-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Grocery list
            </h1>
            <p className="mt-0.5 text-xs text-ink-muted">
              {g.mode === 'demo' ? 'Demo · ' : ''}
              {g.checkedCount} of {g.totalCount} checked
              {g.shoppingTripId
                ? ` · trip ${g.shoppingTripId.slice(0, 10)}…`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void g.refresh()}
            className="min-h-tap min-w-tap rounded-pill px-3 text-sm font-medium text-primary"
            aria-label="Refresh list"
          >
            Refresh
          </button>
        </div>

        {g.error ? (
          <p className="mt-2 rounded-xl bg-critical/10 px-3 py-2 text-xs text-critical">
            {g.error}{' '}
            <button
              type="button"
              className="underline"
              onClick={g.clearError}
            >
              dismiss
            </button>
          </p>
        ) : null}

        {g.tripMessage ? (
          <p className="mt-2 rounded-xl bg-fresh/10 px-3 py-2 text-xs text-fresh">
            {g.tripMessage}{' '}
            <button
              type="button"
              className="underline"
              onClick={g.clearTripMessage}
            >
              ok
            </button>
          </p>
        ) : null}
      </header>

      <div className="flex flex-col gap-5 px-4 py-4">
        {/* Reorder cadence callouts already on list */}
        {g.reorderPending.length > 0 ? (
          <section aria-label="Reorder suggestions">
            <h2 className="mb-2 font-display text-lg font-semibold text-ink">
              On cadence
            </h2>
            <div className="flex flex-col gap-2">
              {g.reorderPending.map((r) => (
                <Card
                  key={`${r.ingredientId}-${r.formId}`}
                  padding="sm"
                  className="border border-tint-sky/80"
                >
                  <p className="text-sm font-semibold text-ink">
                    {r.name ?? r.ingredientId}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {r.note ??
                      `Usually every ${r.cadenceDays}d — last ${r.daysSinceLast}d ago`}
                  </p>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {empty ? (
          <Card className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-display text-xl text-ink">List is empty</p>
            <p className="max-w-xs text-sm text-ink-muted">
              Nothing to buy right now. Add something manually, or refresh after
              cooking and stocking up.
            </p>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-2 min-h-tap rounded-pill bg-primary px-5 text-sm font-semibold text-white"
            >
              Add an item
            </button>
          </Card>
        ) : (
          g.aisleGroups.map((group) => (
            <section key={group.aisle} aria-label={aisleTitle(group.aisle)}>
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">
                {aisleTitle(group.aisle)}
              </h2>
              <ul className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <GroceryLineRow
                      item={item}
                      onToggle={(id) => void g.toggleCheck(id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {/* Manual add */}
        <section>
          {showAdd || empty ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void g.addManual(manualName).then(() => {
                  setManualName('');
                  setShowAdd(false);
                });
              }}
            >
              <input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Add item…"
                className="min-h-tap flex-1 rounded-2xl border border-black/[0.06] bg-surface px-4 text-sm text-ink outline-none focus:border-primary"
                aria-label="Item name"
              />
              <button
                type="submit"
                className="min-h-tap min-w-tap rounded-2xl bg-primary px-4 text-sm font-semibold text-white"
              >
                Add
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className={cn(
                'w-full min-h-tap rounded-2xl border border-dashed border-ink/15',
                'text-sm font-medium text-ink-muted',
              )}
            >
              + Add item
            </button>
          )}
        </section>
      </div>

      {/* End of trip sticky CTA */}
      {!empty ? (
        <div className="sticky bottom-0 border-t border-black/[0.04] bg-bg/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
          <button
            type="button"
            disabled={g.tripCommitting || g.checkedCount === 0}
            onClick={() => void g.endTrip()}
            className={cn(
              'w-full min-h-tap rounded-2xl text-sm font-semibold transition-colors',
              g.checkedCount > 0
                ? 'bg-primary text-white'
                : 'bg-black/[0.06] text-ink-muted',
            )}
          >
            {g.tripCommitting
              ? 'Adding to pantry…'
              : g.checkedCount > 0
                ? `Add ${g.checkedCount} checked to pantry`
                : 'Check items as you shop'}
          </button>
          <p className="mt-1.5 text-center text-[11px] text-ink-muted">
            Purchases keep this trip id so a later receipt scan can reconcile
            (M2).
          </p>
        </div>
      ) : null}
    </div>
  );
}
