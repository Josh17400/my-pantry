import { cn, PlaceholderThumb } from '../../ui';
import type { QuickItem } from './types';

type QuickTileProps = {
  item: QuickItem;
  multiplier: number;
  onConsume: () => void;
  onStep: (next: number) => void;
  onTogglePin: () => void;
  busy?: boolean;
};

/**
 * One-tap consume tile. Stepper is optional — default mult=1 so common case
 * is a single tap (not three).
 */
export function QuickTile({
  item,
  multiplier,
  onConsume,
  onStep,
  onTogglePin,
  busy = false,
}: QuickTileProps) {
  const showStepper = item.dim === 'count' || multiplier > 1;

  return (
    <div
      className={cn(
        'flex flex-col rounded-card bg-surface p-3 shadow-card',
        'min-h-[9.5rem]',
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-1">
        <PlaceholderThumb name={item.name} tint="cream" size="md" />
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={
            item.origin === 'pinned' ? `Unpin ${item.name}` : `Pin ${item.name}`
          }
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-black/[0.04]"
        >
          <span className="text-lg leading-none" aria-hidden>
            {item.origin === 'pinned' ? '★' : '☆'}
          </span>
        </button>
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">{item.name}</div>
        <div className="text-[11px] text-ink-muted">
          {item.origin === 'pinned' ? 'Pinned' : 'Suggested'}
          {item.frequency > 0 ? ` · ${item.frequency}×` : ''}
        </div>
      </div>

      {showStepper ? (
        <div className="mt-2 flex items-center justify-between gap-1">
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={multiplier <= 1 || busy}
            onClick={() => onStep(multiplier - 1)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.04] text-lg font-medium text-ink disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums text-ink">
            {multiplier}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={multiplier >= 12 || busy}
            onClick={() => onStep(multiplier + 1)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.04] text-lg font-medium text-ink disabled:opacity-40"
          >
            +
          </button>
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={onConsume}
        className={cn(
          'mt-2 min-h-tap w-full rounded-2xl bg-primary text-sm font-semibold text-white',
          'active:scale-[0.98] disabled:opacity-50',
        )}
      >
        {multiplier > 1 ? `Eat ${multiplier}` : 'Eat'}
      </button>
    </div>
  );
}
