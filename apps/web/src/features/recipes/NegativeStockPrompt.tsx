import { cn } from '../../ui/cn';
import {
  type CookLineEdit,
  formatBaseQty,
} from './cook-machine';

type NegativeStockPromptProps = {
  lines: readonly CookLineEdit[];
  candidateIndices: readonly number[];
  onAdjust: () => void;
  onProceed: () => void;
  busy?: boolean;
};

/**
 * SPEC: going negative prompts "still have some?" — never silent clamp.
 */
export function NegativeStockPrompt({
  lines,
  candidateIndices,
  onAdjust,
  onProceed,
  busy = false,
}: NegativeStockPromptProps) {
  const candidates = candidateIndices
    .map((i) => lines.find((l) => l.index === i))
    .filter((l): l is CookLineEdit => l != null);

  return (
    <div
      role="alertdialog"
      aria-labelledby="negative-stock-title"
      aria-describedby="negative-stock-desc"
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-card bg-surface-raised p-5 shadow-card">
        <h2
          id="negative-stock-title"
          className="font-display text-xl font-semibold text-ink"
        >
          Still have some?
        </h2>
        <p id="negative-stock-desc" className="mt-2 text-sm text-ink-muted">
          These deductions would leave stock below zero. That may mean the
          pantry was wrong — adjust what you used, or confirm and we will keep
          the negative visible (we never silently clamp).
        </p>

        <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto">
          {candidates.map((line) => {
            const sub = line.substitution?.kind === 'pantry' ? line.substitution : null;
            const have = sub ? sub.haveBase : line.haveBase;
            const used = sub ? sub.actualUsedBase : line.actualUsedBase;
            const dim = sub ? sub.dim : line.needDim;
            const projected =
              have != null && used != null ? have - used : null;
            return (
              <li
                key={line.index}
                className="rounded-xl bg-critical/5 px-3 py-2 text-sm"
              >
                <div className="font-medium text-ink">
                  {line.rawText}
                  {sub ? (
                    <span className="font-normal text-ink-muted">
                      {' '}
                      (via {sub.name})
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-critical">
                  Have {formatBaseQty(have, dim)} → after cook{' '}
                  {formatBaseQty(projected, dim)}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={onAdjust}
            className={cn(
              'min-h-tap flex-1 rounded-pill border border-black/[0.08] bg-surface px-4 text-sm font-semibold text-ink',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            )}
          >
            Adjust amounts
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onProceed}
            className={cn(
              'min-h-tap flex-1 rounded-pill bg-primary px-4 text-sm font-semibold text-white',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              'disabled:opacity-50',
            )}
          >
            Confirm anyway
          </button>
        </div>
      </div>
    </div>
  );
}
