import type { ReactNode } from 'react';

import { cn } from './cn';
import { FreshnessBar } from './FreshnessBar';
import { PlaceholderThumb } from './PlaceholderThumb';
import { StatusBadge } from './StatusBadge';
import { StatusText } from './StatusText';
import type { StatusBand, TintName } from './tokens';

type ItemTileVariant = 'card' | 'row';

export type ItemTileProps = {
  name: string;
  /** e.g. "500g", "1 bunch" */
  quantity?: string;
  status?: StatusBand;
  /** Status / expiry copy */
  statusLabel?: string;
  /** 0–1 for freshness bar (row variant often uses this) */
  freshness?: number;
  /** Show progress bar instead of badge */
  showBar?: boolean;
  image?: ReactNode;
  tint?: TintName;
  variant?: ItemTileVariant;
  className?: string;
  onClick?: () => void;
};

/**
 * Ingredient tile — card (grid/rail) or row (list with optional bar).
 * Uses PlaceholderThumb when no image is provided.
 */
export function ItemTile({
  name,
  quantity,
  status,
  statusLabel,
  freshness,
  showBar = false,
  image,
  tint = 'cream',
  variant = 'card',
  className,
  onClick,
}: ItemTileProps) {
  const thumb =
    image ?? <PlaceholderThumb name={name} tint={tint} size={variant === 'row' ? 'sm' : 'md'} />;

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full min-h-tap items-center gap-3 rounded-2xl bg-surface px-3 py-2.5 text-left shadow-card transition-colors',
          'hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          className,
        )}
      >
        {thumb}
        <div className="min-w-0 flex-1">
          <div className="truncate font-sans text-sm font-semibold text-ink">
            {name}
          </div>
          {quantity ? (
            <div className="truncate text-xs text-ink-muted">{quantity}</div>
          ) : null}
        </div>
        <div className="max-w-[45%] shrink-0 text-right">
          {showBar && status && freshness !== undefined && statusLabel ? (
            <FreshnessBar
              value={freshness}
              status={status}
              label={statusLabel}
              className="min-w-[7rem]"
            />
          ) : status && statusLabel ? (
            <StatusText status={status}>{statusLabel}</StatusText>
          ) : status ? (
            <StatusBadge status={status} showDot={false} />
          ) : null}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-[7.5rem] shrink-0 flex-col rounded-card bg-surface p-2.5 text-left shadow-card transition-colors',
        'hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className,
      )}
    >
      <div className="mb-2 flex justify-center">{thumb}</div>
      <div className="truncate text-sm font-semibold text-ink">{name}</div>
      {quantity ? (
        <div className="truncate text-xs text-ink-muted">{quantity}</div>
      ) : null}
      {status ? (
        <div className="mt-1">
          <StatusBadge
            status={status}
            label={statusLabel}
            showDot
          />
        </div>
      ) : null}
    </button>
  );
}
