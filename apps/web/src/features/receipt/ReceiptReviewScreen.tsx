/**
 * Bulk-first receipt review.
 * High-confidence collapsed · per-line only for medium/low/allergen/size.
 * Dev tap counter always visible in development.
 */

import { type ReactNode,useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DEFAULT_HOUSEHOLD_ID } from '../../db/constants';
import { usePantry } from '../../state/pantry-store';
import { Card, cn } from '../../ui';
import { commitReceipt } from './commit';
import {
  attentionLines,
  canCommit,
  commitPreview,
  filteredLines,
  highAutoLines,
  pendingCategories,
  pendingCount,
  reduceReview,
  type ReviewLine,
  type ReviewState,
} from './review-model';
import {
  clearReviewState,
  loadReviewState,
  stashCommitResult,
  stashReviewState,
} from './session';

export type ReceiptReviewScreenProps = {
  readonly initialState?: ReviewState | null;
  /** Inject append for tests. */
  readonly appendTxn?: (txn: Parameters<
    ReturnType<typeof usePantry>['appendTxn']
  >[0]) => Promise<void>;
  readonly localOnly?: boolean;
  readonly householdId?: string;
};

function TapBadge({ count }: { count: number }) {
  return (
    <div
      className="rounded-pill bg-primary/10 px-3 py-1 text-xs font-semibold tabular-nums text-primary"
      data-testid="tap-count"
      title="Dev metric: user taps on this review"
    >
      Taps: {count}
    </div>
  );
}

function CollapsedSummary({
  title,
  count,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card padding="sm" className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-tap w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold text-ink">
          {title}
          <span className="ml-2 font-normal text-ink-muted">
            ({count})
          </span>
        </span>
        <span className="text-xs text-ink-muted">
          {collapsed ? 'Show' : 'Hide'}
        </span>
      </button>
      {!collapsed ? <div className="flex flex-col gap-2">{children}</div> : null}
    </Card>
  );
}

function LineRow({
  line,
  onAccept,
  onSkip,
  onPackage,
  onSelectIngredient,
}: {
  line: ReviewLine;
  onAccept: () => void;
  onSkip: () => void;
  onPackage: (label: string) => void;
  onSelectIngredient: (id: string) => void;
}) {
  const isAllergen = line.bucket === 'allergen-veto';
  const isSize = line.bucket === 'size-ambiguity';

  return (
    <div
      className={cn(
        'rounded-xl border border-black/[0.06] bg-surface-raised px-3 py-3',
        isAllergen && 'border-critical/40',
      )}
      data-bucket={line.bucket}
      data-line-id={line.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {line.source.guessedName || line.source.rawText}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {line.ingredientName
              ? `→ ${line.ingredientName}`
              : 'No match yet'}
            {line.matchStep ? ` · ${line.matchStep}` : ''}
            {line.unitPrice != null ? ` · $${line.unitPrice.toFixed(2)}` : ''}
          </p>
          {isAllergen ? (
            <p className="mt-1 text-xs font-medium text-critical">
              Allergen guard — confirm carefully (not bulk-eligible)
            </p>
          ) : null}
          {isSize && line.packageChoices.length > 0 ? (
            <div className="mt-2">
              <p className="text-xs font-medium text-ink">
                {line.packageChoices.length === 2
                  ? `${line.packageChoices[0]!.displayLabel} or ${line.packageChoices[1]!.displayLabel}?`
                  : 'Which package size?'}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {line.packageChoices.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => onPackage(p.label)}
                    className={cn(
                      'min-h-tap rounded-pill px-3 text-xs font-semibold',
                      line.selectedPackage?.label === p.label
                        ? 'bg-primary text-white'
                        : 'bg-surface text-ink shadow-card',
                    )}
                  >
                    {p.displayLabel}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {line.bucket === 'unmatched' && line.candidates.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {line.candidates.slice(0, 4).map((c) => (
                <button
                  key={c.ingredientId}
                  type="button"
                  onClick={() => onSelectIngredient(c.ingredientId)}
                  className="min-h-tap rounded-pill bg-surface px-3 text-xs font-semibold text-ink shadow-card"
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {line.disposition === 'pending' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={
              !line.ingredientId ||
              !line.formId ||
              line.qtyBase == null ||
              line.bucket === 'size-ambiguity'
            }
            className="min-h-tap rounded-pill bg-primary px-4 text-xs font-semibold text-white disabled:opacity-40"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="min-h-tap rounded-pill bg-surface px-4 text-xs font-semibold text-ink shadow-card"
          >
            Skip
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs font-medium text-fresh">
          {line.disposition === 'accepted' ? 'Accepted' : 'Skipped'}
        </p>
      )}
    </div>
  );
}

export function ReceiptReviewScreen({
  initialState,
  appendTxn: appendTxnProp,
  localOnly = false,
  householdId = DEFAULT_HOUSEHOLD_ID,
}: ReceiptReviewScreenProps) {
  const navigate = useNavigate();
  const pantry = usePantry();
  const appendTxn = appendTxnProp ?? pantry.appendTxn;

  const [state, setState] = useState<ReviewState | null>(() => {
    if (initialState) return initialState;
    return loadReviewState();
  });
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((next: ReviewState) => {
    setState(next);
    stashReviewState(next);
  }, []);

  const high = useMemo(
    () => (state ? highAutoLines(state) : []),
    [state],
  );
  const filtered = useMemo(
    () => (state ? filteredLines(state) : []),
    [state],
  );
  const attention = useMemo(
    () => (state ? attentionLines(state) : []),
    [state],
  );
  const categories = useMemo(
    () => (state ? pendingCategories(state) : []),
    [state],
  );
  const preview = state ? commitPreview(state) : null;
  const ready = state ? canCommit(state) : false;
  const pending = state ? pendingCount(state) : 0;

  const onCommit = useCallback(async () => {
    if (!state || !canCommit(state)) return;
    setCommitting(true);
    setError(null);
    // Count commit button as a tap
    const withTap = { ...state, tapCount: state.tapCount + 1 };
    const res = await commitReceipt({
      state: withTap,
      appendTxn,
      householdId,
      localOnly:
        localOnly ||
        withTap.attemptId.startsWith('attempt-synthetic') ||
        !import.meta.env.VITE_SUPABASE_URL,
    });
    setCommitting(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    stashCommitResult({
      message: res.result.message,
      tapCount: withTap.tapCount,
      added: res.result.added,
      skipped: res.result.skipped,
    });
    clearReviewState();
    void navigate('/pantry', {
      state: {
        receiptCommit: res.result.message,
        tapCount: withTap.tapCount,
      },
    });
  }, [appendTxn, householdId, localOnly, navigate, state]);

  if (!state) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 pt-safe">
        <p className="text-center text-sm text-ink-muted">
          No receipt to review. Scan a receipt first.
        </p>
        <button
          type="button"
          onClick={() => navigate('/scan')}
          className="min-h-tap rounded-pill bg-primary px-5 text-sm font-semibold text-white"
        >
          Scan receipt
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col pb-safe">
      <header className="border-b border-black/[0.04] px-4 pb-3 pt-safe">
        <div className="flex items-start justify-between gap-3 pt-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              Review
            </h1>
            <p className="mt-0.5 text-xs text-ink-muted">
              {state.storeName ?? 'Receipt'}
              {state.receiptDate ? ` · ${state.receiptDate}` : ''}
              {state.total != null ? ` · $${state.total.toFixed(2)}` : ''}
            </p>
          </div>
          <TapBadge count={state.tapCount} />
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 py-4">
        {/* Bulk actions */}
        <Card padding="sm" className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Bulk actions
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                apply(reduceReview(state, { type: 'bulk-accept-high' }))
              }
              className="min-h-tap rounded-pill bg-surface px-3 text-xs font-semibold text-ink shadow-card"
            >
              Accept all high-confidence
            </button>
            <button
              type="button"
              onClick={() =>
                apply(reduceReview(state, { type: 'bulk-dismiss-filtered' }))
              }
              className="min-h-tap rounded-pill bg-surface px-3 text-xs font-semibold text-ink shadow-card"
            >
              Dismiss all non-food
            </button>
            <button
              type="button"
              onClick={() =>
                apply(
                  reduceReview(state, { type: 'bulk-accept-review-matches' }),
                )
              }
              className="min-h-tap rounded-pill bg-primary px-3 text-xs font-semibold text-white"
            >
              Accept all suggested matches
            </button>
          </div>
          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() =>
                    apply(
                      reduceReview(state, {
                        type: 'bulk-apply-category',
                        category: cat,
                      }),
                    )
                  }
                  className="min-h-tap rounded-pill bg-tint-sage/50 px-3 text-xs font-semibold text-ink"
                >
                  Accept all {cat}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-[11px] text-ink-muted">
            Allergen-flagged lines never bulk-accept. Size choices stay
            per-line.
          </p>
        </Card>

        {high.length > 0 ? (
          <CollapsedSummary
            title={`${high.length} items matched — review`}
            count={high.length}
            collapsed={state.highCollapsed}
            onToggle={() =>
              apply(reduceReview(state, { type: 'toggle-high-collapsed' }))
            }
          >
            {high.map((l) => (
              <div
                key={l.id}
                className="flex justify-between gap-2 text-xs text-ink-muted"
              >
                <span className="truncate">
                  {l.ingredientName ?? l.source.guessedName}
                </span>
                <span className="shrink-0 text-fresh">auto</span>
              </div>
            ))}
          </CollapsedSummary>
        ) : null}

        {filtered.length > 0 ? (
          <CollapsedSummary
            title="Ignored (non-food, tax, discounts)"
            count={filtered.length}
            collapsed={state.filteredCollapsed}
            onToggle={() =>
              apply(
                reduceReview(state, { type: 'toggle-filtered-collapsed' }),
              )
            }
          >
            {filtered.map((l) => (
              <div
                key={l.id}
                className="flex justify-between gap-2 text-xs text-ink-muted"
              >
                <span className="truncate">
                  {l.source.guessedName || l.source.rawText}
                </span>
                <span className="shrink-0">{l.source.lineType}</span>
              </div>
            ))}
          </CollapsedSummary>
        ) : null}

        {attention.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Needs your eyes ({attention.length})
            </p>
            {attention.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                onAccept={() =>
                  apply(
                    reduceReview(state, {
                      type: 'accept-line',
                      lineId: line.id,
                    }),
                  )
                }
                onSkip={() =>
                  apply(
                    reduceReview(state, {
                      type: 'skip-line',
                      lineId: line.id,
                    }),
                  )
                }
                onPackage={(label) =>
                  apply(
                    reduceReview(state, {
                      type: 'resolve-package',
                      lineId: line.id,
                      packageLabel: label,
                    }),
                  )
                }
                onSelectIngredient={(id) =>
                  apply(
                    reduceReview(state, {
                      type: 'select-ingredient',
                      lineId: line.id,
                      ingredientId: id,
                    }),
                  )
                }
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-fresh">
            All lines resolved. Ready to add to pantry.
          </p>
        )}

        {error ? (
          <p className="rounded-xl bg-critical/10 px-3 py-2 text-sm text-critical">
            {error}
          </p>
        ) : null}

        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-black/[0.04] bg-bg py-3">
          {preview ? (
            <p className="text-center text-xs text-ink-muted">
              {preview.message}
              {pending > 0 ? ` · ${pending} still pending` : ''}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!ready || committing}
            onClick={() => void onCommit()}
            className={cn(
              'min-h-tap w-full rounded-pill bg-primary text-sm font-semibold text-white',
              'disabled:opacity-40',
            )}
          >
            {committing
              ? 'Adding…'
              : ready
                ? `Add to pantry`
                : `Resolve ${pending} item${pending === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
