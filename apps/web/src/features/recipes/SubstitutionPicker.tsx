import { useMemo, useState } from 'react';

import type { PantryItemView } from '../../db/types';
import { cn } from '../../ui/cn';
import type { CookLineEdit } from './cook-machine';
import {
  buildPantrySubstitution,
  type RankedPantryCandidate,
  rankPantryForSubstitution,
} from './substitution';

type SubstitutionPickerProps = {
  line: CookLineEdit;
  pantry: readonly PantryItemView[];
  onSelectPantry: (candidate: RankedPantryCandidate) => void;
  onSelectOther: (note: string) => void;
  onClose: () => void;
};

/**
 * Pantry-backed substitute picker.
 * Other (top) = free text, nothing deducted.
 * Selecting a pantry row deducts that item instead of the original.
 */
export function SubstitutionPicker({
  line,
  pantry,
  onSelectPantry,
  onSelectOther,
  onClose,
}: SubstitutionPickerProps) {
  const [query, setQuery] = useState('');
  const [otherMode, setOtherMode] = useState(false);
  const [otherNote, setOtherNote] = useState(
    line.substitution?.kind === 'other' ? line.substitution.note : '',
  );

  const ranked = useMemo(
    () => rankPantryForSubstitution(line, pantry, query),
    [line, pantry, query],
  );

  const sameCategory = ranked.filter((c) => c.sameCategory && c.inStock);
  const otherInStock = ranked.filter((c) => !c.sameCategory && c.inStock);
  const outOfStock = ranked.filter((c) => !c.inStock);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sub-picker-title"
      data-testid="substitution-picker"
    >
      <header className="border-b border-black/[0.06] bg-surface px-4 pb-3 pt-safe">
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-tap min-w-tap rounded-pill px-3 text-sm font-semibold text-primary"
            data-testid="sub-picker-close"
          >
            Cancel
          </button>
          <p
            id="sub-picker-title"
            className="text-center text-xs font-medium uppercase tracking-wide text-ink-muted"
          >
            Substitute
          </p>
          <div className="min-w-[4.5rem]" />
        </div>
        <h2 className="mt-2 font-display text-lg font-semibold text-ink">
          {line.rawText}
        </h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          Pick what you actually used. Pantry items are deducted; Other is
          noted only.
        </p>
      </header>

      <div className="border-b border-black/[0.04] bg-surface px-4 py-3">
        <button
          type="button"
          onClick={() => setOtherMode(true)}
          className={cn(
            'flex min-h-tap w-full items-center gap-3 rounded-2xl border px-3 text-left',
            otherMode
              ? 'border-primary bg-primary/10'
              : 'border-black/[0.08] bg-surface-raised',
          )}
          data-testid="sub-picker-other"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
            +
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Other</span>
            <span className="block text-xs text-ink-muted">
              Not in pantry — noted, nothing deducted
            </span>
          </span>
        </button>

        {otherMode ? (
          <div className="mt-3 space-y-2">
            <label className="block text-xs font-medium text-ink-muted">
              What did you use?
            </label>
            <input
              type="text"
              value={otherNote}
              onChange={(e) => setOtherNote(e.target.value)}
              placeholder="e.g. leftover taco seasoning from a friend"
              className={cn(
                'min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface-raised px-3 text-sm text-ink',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              )}
              data-testid="sub-picker-other-input"
            />
            <p className="text-xs text-ink-muted">
              This is written on the cook event for provenance. The pantry is
              not changed.
            </p>
            <button
              type="button"
              disabled={!otherNote.trim()}
              onClick={() => onSelectOther(otherNote.trim())}
              className="min-h-tap w-full rounded-pill bg-primary text-sm font-semibold text-white disabled:opacity-50"
              data-testid="sub-picker-other-confirm"
            >
              Note only — nothing deducted
            </button>
          </div>
        ) : null}
      </div>

      {!otherMode ? (
        <>
          <div className="border-b border-black/[0.04] bg-surface px-4 py-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your pantry…"
              className={cn(
                'min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface-raised px-3 text-sm text-ink',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              )}
              data-testid="sub-picker-search"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 pb-safe">
            {ranked.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">
                {pantry.length === 0
                  ? 'Pantry is empty. Use Other to note what you used.'
                  : 'No matches. Try a different search or Other.'}
              </p>
            ) : (
              <div className="space-y-4">
                {sameCategory.length > 0 ? (
                  <CandidateGroup
                    title="Same category"
                    candidates={sameCategory}
                    onSelect={onSelectPantry}
                  />
                ) : null}
                {otherInStock.length > 0 ? (
                  <CandidateGroup
                    title="In stock"
                    candidates={otherInStock}
                    onSelect={onSelectPantry}
                  />
                ) : null}
                {outOfStock.length > 0 ? (
                  <CandidateGroup
                    title="Out of stock"
                    candidates={outOfStock}
                    onSelect={onSelectPantry}
                  />
                ) : null}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function CandidateGroup({
  title,
  candidates,
  onSelect,
}: {
  title: string;
  candidates: readonly RankedPantryCandidate[];
  onSelect: (c: RankedPantryCandidate) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      <ul className="space-y-2">
        {candidates.map((c) => (
          <li key={`${c.ingredientId}:${c.formId}`}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              className="flex min-h-tap w-full items-center gap-3 rounded-2xl border border-black/[0.04] bg-surface px-3 py-2 text-left shadow-card"
              data-testid="sub-picker-candidate"
              data-ingredient-id={c.ingredientId}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">
                  {c.name}
                </span>
                <span className="block text-xs text-ink-muted">
                  {[c.formName, c.locationName].filter(Boolean).join(' · ') ||
                    c.category}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 text-sm font-semibold tabular-nums',
                  c.inStock ? 'text-ink' : 'text-critical',
                )}
              >
                {c.qtyLabel}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Convenience: apply ranked candidate → pantry substitution via helper. */
export function candidateToSubstitution(
  line: CookLineEdit,
  candidate: RankedPantryCandidate,
) {
  return buildPantrySubstitution(line, candidate);
}
