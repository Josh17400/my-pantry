import { cn } from '../../ui/cn';
import { AllergenUnknownBadge } from './AllergenUnknownBadge';
import {
  type CookLineEdit,
  formatBaseQty,
  presentCookStatus,
} from './cook-machine';
import { statusChipClass } from './status-styles';
import { substitutionSummaryLabel } from './substitution';

type CookPreviewLineProps = {
  line: CookLineEdit;
  onActualUsedChange: (index: number, value: number | null) => void;
  onSkippedChange: (index: number, skipped: boolean) => void;
  onOpenSubstitution: (index: number) => void;
  onClearSubstitution: (index: number) => void;
  onGroceryToggle: (index: number, send: boolean) => void;
  disabled?: boolean;
};

export function CookPreviewLine({
  line,
  onActualUsedChange,
  onSkippedChange,
  onOpenSubstitution,
  onClearSubstitution,
  onGroceryToggle,
  disabled = false,
}: CookPreviewLineProps) {
  const presentation = presentCookStatus(line.status);
  const dim = line.needDim;
  const sub = line.substitution;
  const pantrySub = sub?.kind === 'pantry' ? sub : null;
  const otherSub = sub?.kind === 'other' ? sub : null;

  const showAmountEditor =
    !line.nonQuantified &&
    !otherSub &&
    (pantrySub != null ||
      line.convertible ||
      line.status === 'not-convertible' ||
      line.status === 'not-in-pantry');

  const amountDim = pantrySub?.dim ?? dim;
  const amountValue = pantrySub
    ? pantrySub.actualUsedBase
    : line.skipped || line.actualUsedBase === null
      ? null
      : line.actualUsedBase;
  const amountDisabled =
    disabled || (pantrySub ? false : line.skipped) || Boolean(otherSub);

  const subLabel = substitutionSummaryLabel(sub);

  return (
    <article
      className={cn(
        'rounded-card border border-black/[0.04] bg-surface p-4 shadow-card',
        line.unknownAllergens && 'ring-1 ring-critical/30',
        sub && 'ring-1 ring-primary/25',
      )}
      data-status={line.status}
      data-line-index={line.index}
      data-has-substitution={sub ? sub.kind : 'none'}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-sans text-sm font-semibold text-ink">
            {line.rawText}
          </h3>
          {line.groupSatisfied ? (
            <p className="mt-0.5 text-xs text-fresh">
              Substitution group covered
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            'shrink-0 rounded-pill px-2.5 py-1 text-xs font-medium',
            statusChipClass(presentation.tone),
          )}
        >
          {presentation.label}
        </span>
      </div>

      {line.unknownAllergens ? (
        <div className="mb-2">
          <AllergenUnknownBadge compact />
        </div>
      ) : null}

      {line.status === 'not-convertible' ? (
        <p className="mb-3 text-xs text-critical">{presentation.description}</p>
      ) : null}

      <dl className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-bg/80 px-2 py-2">
          <dt className="text-ink-muted">Need</dt>
          <dd className="mt-0.5 font-semibold text-ink">
            {formatBaseQty(line.needBase, dim)}
          </dd>
        </div>
        <div className="rounded-xl bg-bg/80 px-2 py-2">
          <dt className="text-ink-muted">Have</dt>
          <dd className="mt-0.5 font-semibold text-ink">
            {formatBaseQty(line.haveBase, dim)}
          </dd>
        </div>
        <div className="rounded-xl bg-bg/80 px-2 py-2">
          <dt className="text-ink-muted">Short</dt>
          <dd className="mt-0.5 font-semibold text-ink">
            {line.shortfallBase === null
              ? '—'
              : formatBaseQty(line.shortfallBase, dim)}
          </dd>
        </div>
      </dl>

      {line.uncertaintyPct != null && line.uncertaintyPct > 0 ? (
        <p className="mb-2 text-xs text-low">
          Conversion uncertainty ≈ {Math.round(line.uncertaintyPct)}%
        </p>
      ) : null}

      {/* Substitution status */}
      {pantrySub ? (
        <div
          className="mb-3 rounded-xl bg-primary/10 px-3 py-2 text-sm"
          data-testid="line-substitution-pantry"
        >
          <p className="font-semibold text-ink">
            Substituting → {pantrySub.name}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {[pantrySub.formName, pantrySub.locationName]
              .filter(Boolean)
              .join(' · ') || pantrySub.category}
            {' · '}have {formatBaseQty(pantrySub.haveBase, pantrySub.dim)}
          </p>
          <p className="mt-1 text-xs font-medium text-primary">
            Deducts {pantrySub.name}, not the original
          </p>
          {pantrySub.needsAmount || pantrySub.actualUsedBase === null ? (
            <p className="mt-1 text-xs text-critical">
              Enter how much you used — no conversion path to auto-fill.
            </p>
          ) : null}
        </div>
      ) : null}

      {otherSub ? (
        <div
          className="mb-3 rounded-xl bg-low/10 px-3 py-2 text-sm"
          data-testid="line-substitution-other"
        >
          <p className="font-semibold text-ink">Other: {otherSub.note}</p>
          <p className="mt-1 text-xs font-medium text-low">
            Noted on the cook event — nothing deducted from the pantry
          </p>
        </div>
      ) : null}

      {showAmountEditor ? (
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            {pantrySub ? 'Substitute amount used' : 'Actually used'}{' '}
            {amountDim
              ? `(${amountDim === 'mass' ? 'g' : amountDim === 'volume' ? 'ml' : 'each'})`
              : ''}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              disabled={amountDisabled}
              value={amountValue === null ? '' : amountValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') {
                  onActualUsedChange(line.index, null);
                  return;
                }
                const n = Number(v);
                onActualUsedChange(line.index, Number.isFinite(n) ? n : null);
              }}
              className={cn(
                'min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface-raised px-3 text-sm text-ink',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                'disabled:opacity-50',
              )}
              aria-label={`Actually used for ${line.rawText}`}
              data-testid="line-actual-used"
            />
            {!pantrySub && !otherSub ? (
              <label className="flex min-h-tap shrink-0 items-center gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={line.skipped}
                  disabled={disabled}
                  onChange={(e) => onSkippedChange(line.index, e.target.checked)}
                  className="h-5 w-5 accent-primary"
                />
                Skip
              </label>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">
            Real cooking is not exact — edit before confirming.
          </p>
        </div>
      ) : !otherSub ? (
        <p className="mb-3 text-xs text-ink-muted">{presentation.description}</p>
      ) : null}

      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onOpenSubstitution(line.index)}
          className={cn(
            'min-h-tap flex-1 rounded-pill border border-primary/25 bg-primary/10 px-3 text-sm font-semibold text-primary',
            'disabled:opacity-50',
          )}
          data-testid="line-substitute-btn"
        >
          {sub ? 'Change substitute' : 'Substitute'}
        </button>
        {sub ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onClearSubstitution(line.index)}
            className="min-h-tap rounded-pill border border-black/[0.08] bg-surface px-3 text-sm font-semibold text-ink disabled:opacity-50"
            data-testid="line-clear-substitute"
          >
            Clear
          </button>
        ) : null}
      </div>

      {subLabel && !pantrySub && !otherSub ? (
        <p className="mb-2 text-xs text-ink-muted">{subLabel}</p>
      ) : null}

      {(line.status === 'short' ||
        line.status === 'not-in-pantry' ||
        line.status === 'not-convertible') &&
        !pantrySub && (
          <label className="flex min-h-tap items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={line.sendShortfallToGrocery}
              disabled={disabled}
              onChange={(e) => onGroceryToggle(line.index, e.target.checked)}
              className="h-5 w-5 accent-primary"
            />
            Add shortfall to grocery list
          </label>
        )}
    </article>
  );
}
