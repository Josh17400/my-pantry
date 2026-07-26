import { cn } from '../../ui/cn';
import { AllergenUnknownBadge } from './AllergenUnknownBadge';
import {
  type CookLineEdit,
  formatBaseQty,
  presentCookStatus,
} from './cook-machine';
import { statusChipClass } from './status-styles';

type CookPreviewLineProps = {
  line: CookLineEdit;
  onActualUsedChange: (index: number, value: number | null) => void;
  onSkippedChange: (index: number, skipped: boolean) => void;
  onSubstitutionChange: (index: number, note: string) => void;
  onGroceryToggle: (index: number, send: boolean) => void;
  disabled?: boolean;
};

export function CookPreviewLine({
  line,
  onActualUsedChange,
  onSkippedChange,
  onSubstitutionChange,
  onGroceryToggle,
  disabled = false,
}: CookPreviewLineProps) {
  const presentation = presentCookStatus(line.status);
  const dim = line.needDim;
  const showAmountEditor =
    !line.nonQuantified &&
    (line.convertible ||
      line.status === 'not-convertible' ||
      line.status === 'not-in-pantry');

  return (
    <article
      className={cn(
        'rounded-card border border-black/[0.04] bg-surface p-4 shadow-card',
        line.unknownAllergens && 'ring-1 ring-critical/30',
      )}
      data-status={line.status}
      data-line-index={line.index}
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

      {showAmountEditor ? (
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Actually used {dim ? `(${dim === 'mass' ? 'g' : dim === 'volume' ? 'ml' : 'each'})` : ''}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              disabled={disabled || line.skipped}
              value={line.skipped || line.actualUsedBase === null ? '' : line.actualUsedBase}
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
            />
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
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">
            Real cooking is not exact — edit before confirming.
          </p>
        </div>
      ) : (
        <p className="mb-3 text-xs text-ink-muted">{presentation.description}</p>
      )}

      <div className="mb-2">
        <label className="mb-1 block text-xs font-medium text-ink-muted">
          Substitution note
        </label>
        <input
          type="text"
          disabled={disabled}
          value={line.substitutionNote}
          onChange={(e) => onSubstitutionChange(line.index, e.target.value)}
          placeholder="e.g. used margarine"
          className={cn(
            'min-h-tap w-full rounded-xl border border-black/[0.08] bg-surface-raised px-3 text-sm text-ink',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          )}
        />
      </div>

      {(line.status === 'short' ||
        line.status === 'not-in-pantry' ||
        line.status === 'not-convertible') && (
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
