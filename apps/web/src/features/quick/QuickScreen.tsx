import { Card, cn } from '../../ui';
import { QuickTile } from './QuickTile';
import { useQuickItems } from './useQuickItems';

/**
 * Quick-consume screen — one tap from home for non-recipe eating.
 * Undo is mandatory; mis-taps are the common case.
 *
 * Tiles come from pantry stock (live) or a labelled demo catalog.
 */
export function QuickScreen() {
  const q = useQuickItems();

  if (q.loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 pt-safe">
        <div className="h-10 w-10 animate-pulse rounded-full bg-primary/20" />
        <p className="text-sm text-ink-muted">Loading quick items…</p>
      </div>
    );
  }

  if (q.error && q.items.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 pt-safe">
        <p className="text-center text-sm text-critical">{q.error}</p>
        <button
          type="button"
          onClick={q.refresh}
          className="min-h-tap rounded-pill bg-primary px-5 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  const pinned = q.items.filter((i) => i.origin === 'pinned');
  const suggested = q.items.filter((i) => i.origin === 'suggested');
  const emptyAll = q.items.length === 0;
  const emptyPins = pinned.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col pb-safe">
      <header className="border-b border-black/[0.04] px-4 pb-3 pt-safe">
        <div className="pt-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Quick items
          </h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            One tap to log a snack — not a recipe.
            {q.mode === 'demo' ? ' · Demo mode' : ''}
          </p>
        </div>

        {q.error ? (
          <p className="mt-2 rounded-xl bg-critical/10 px-3 py-2 text-xs text-critical">
            {q.error}{' '}
            <button type="button" className="underline" onClick={q.clearError}>
              dismiss
            </button>
          </p>
        ) : null}

        {q.lastConsume ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-fresh/10 px-3 py-2">
            <p className="text-xs text-fresh">
              Logged {q.lastConsume.item.name}
              {q.lastConsume.qtyBase !== q.lastConsume.item.defaultQtyBase
                ? ` (×${Math.round(q.lastConsume.qtyBase / q.lastConsume.item.defaultQtyBase)})`
                : ''}
            </p>
            <button
              type="button"
              disabled={q.undoBusy}
              onClick={() => void q.undoLast()}
              className="min-h-tap shrink-0 rounded-pill px-3 text-sm font-semibold text-primary"
            >
              {q.undoBusy ? 'Undoing…' : 'Undo'}
            </button>
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-6 px-4 py-4">
        {emptyAll ? (
          <Card className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-display text-xl text-ink">Nothing to quick-eat</p>
            <p className="max-w-xs text-sm text-ink-muted">
              Quick eat shows things you have on hand — add items to your pantry
              first.
            </p>
          </Card>
        ) : (
          <>
            <section aria-label="Pinned quick items">
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">
                Pinned
              </h2>
              {emptyPins ? (
                <Card className="py-8 text-center">
                  <p className="font-display text-lg text-ink">No pinned items</p>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
                    Pin snacks you grab often so logging them is one tap from
                    home. Only items currently in your pantry can be pinned.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {pinned.map((item) => (
                    <QuickTile
                      key={item.id}
                      item={item}
                      multiplier={q.qtyMultiplier[item.id] ?? 1}
                      maxMultiplier={q.maxMultiplier(item)}
                      onConsume={() => void q.consume(item)}
                      onStep={(n) => q.setMultiplier(item.id, n)}
                      onTogglePin={() => q.unpin(item)}
                    />
                  ))}
                </div>
              )}
            </section>

            {suggested.length > 0 ? (
              <section aria-label="Suggested by frequency">
                <h2 className="mb-2 font-display text-lg font-semibold text-ink">
                  Suggested
                </h2>
                <p className="mb-2 text-xs text-ink-muted">
                  {q.mode === 'demo'
                    ? 'Demo suggestions — not your pantry.'
                    : 'From your pantry, ordered by how often you log them.'}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {suggested.map((item) => (
                    <QuickTile
                      key={item.id}
                      item={item}
                      multiplier={q.qtyMultiplier[item.id] ?? 1}
                      maxMultiplier={q.maxMultiplier(item)}
                      onConsume={() => void q.consume(item)}
                      onStep={(n) => q.setMultiplier(item.id, n)}
                      onTogglePin={() => q.pin(item)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}

        {/* Interaction cost callout for report / design honesty */}
        <p className={cn('text-center text-[11px] text-ink-muted')}>
          Common case: 1 tap. Stepper only when you need “2 eggs.”
        </p>
      </div>
    </div>
  );
}
