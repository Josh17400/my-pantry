import type { GroceryListItemRow } from '../../db/types';
import { cn } from '../../ui';
import { isUnmergedItem } from './map-list';
import { SourceChips } from './SourceChips';

type GroceryLineRowProps = {
  item: GroceryListItemRow;
  onToggle: (id: string) => void;
  disabled?: boolean;
};

/**
 * One grocery line — large tap target for one-handed in-store use.
 * Check-off is optimistic at the screen layer.
 */
export function GroceryLineRow({
  item,
  onToggle,
  disabled = false,
}: GroceryLineRowProps) {
  const unmerged = isUnmergedItem(item);
  const noteWithoutFlag = item.notes?.replace(/^⚠\s*/, '') ?? null;

  return (
    <button
      type="button"
      onClick={() => onToggle(item.id)}
      disabled={disabled}
      aria-pressed={item.checked}
      aria-label={`${item.checked ? 'Uncheck' : 'Check'} ${item.name}, ${item.displayQty}`}
      className={cn(
        'flex w-full min-h-tap items-start gap-3 rounded-2xl bg-surface px-3 py-3 text-left shadow-card',
        'transition-colors active:bg-surface-raised',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:opacity-60',
        item.checked && 'opacity-70',
      )}
    >
      {/* Checkbox — 44px hit area */}
      <span
        className={cn(
          'mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2',
          item.checked
            ? 'border-primary bg-primary text-white'
            : 'border-ink/20 bg-surface-raised',
        )}
        aria-hidden
      >
        {item.checked ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12l5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>

      <div className="min-w-0 flex-1 pt-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              'truncate font-sans text-base font-semibold text-ink',
              item.checked && 'line-through text-ink-muted',
            )}
          >
            {item.name}
          </span>
          <span
            className={cn(
              'shrink-0 font-sans text-sm font-medium tabular-nums text-ink',
              item.checked && 'text-ink-muted line-through',
            )}
          >
            {item.displayQty || '—'}
          </span>
        </div>

        <div className="mt-1.5">
          <SourceChips sources={item.sources} />
        </div>

        {unmerged ? (
          <p className="mt-1.5 text-xs font-medium text-low">
            Kept separate — units could not be merged
          </p>
        ) : null}

        {noteWithoutFlag ? (
          <p className="mt-1 line-clamp-2 text-xs text-ink-muted">
            {noteWithoutFlag}
          </p>
        ) : null}
      </div>
    </button>
  );
}
