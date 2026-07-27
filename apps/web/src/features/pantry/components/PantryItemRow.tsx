import { Link } from 'react-router-dom';

import { resolveIngredientTitle } from '../../../db/ingredient-display';
import type { PantryItemView } from '../../../db/types';
import { cn } from '../../../ui/cn';
import { PlaceholderThumb } from '../../../ui/PlaceholderThumb';
import { StatusText } from '../../../ui/StatusText';
import type { TintName } from '../../../ui/tokens';
import {
  formatItemQuantity,
} from '../lib/provenance-display';
import { resolveStockUi } from '../lib/stock-display';
import { ProvenanceLine } from './ProvenanceLine';

const TINTS: TintName[] = ['sage', 'tan', 'sky', 'cream'];

function tintFor(name: string): TintName {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % 997;
  return TINTS[h % TINTS.length]!;
}

/**
 * Safe title for a pantry row when the catalog join may have failed.
 * Never shows a location name or a raw ingredient id as the title — stale
 * SQLite rows from an older build can leave unresolved ids after updates.
 *
 * Falls back to the in-app seed catalog by id so a freshly added item still
 * titles correctly even when the local `ingredients` table is missing that row.
 */
export function resolvePantryItemDisplayName(item: {
  ingredientName?: string | null;
  ingredientId: string;
  locationName?: string | null;
}): string {
  return (
    resolveIngredientTitle({
      ingredientId: item.ingredientId,
      ingredientName: item.ingredientName,
      locationName: item.locationName,
    }) ?? 'Unknown item'
  );
}

export type PantryItemRowProps = {
  item: PantryItemView;
  nowMs?: number;
  className?: string;
  /** When set, row is a button instead of a Link (preview / tests). */
  onSelect?: (item: PantryItemView) => void;
};

export function PantryItemRow({
  item,
  nowMs,
  className,
  onSelect,
}: PantryItemRowProps) {
  const displayName = resolvePantryItemDisplayName(item);

  const fields = {
    lastVerifiedAt: item.lastVerifiedAt,
    unverifiedCookCount: item.unverifiedCookCount,
  };
  const qty = formatItemQuantity(item.qtyBase, item.dim, fields, nowMs);
  const stock = resolveStockUi(
    {
      qtyBase: item.qtyBase,
      parLevelBase: item.parLevelBase,
      lowThresholdPct: item.lowThresholdPct,
      expiresAt: item.expiresAt,
      isNegative: item.isNegative,
    },
    nowMs,
  );

  const body = (
    <>
      <PlaceholderThumb
        name={displayName}
        tint={tintFor(displayName)}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div
          className="truncate font-sans text-sm font-semibold text-ink"
          data-testid="pantry-item-name"
        >
          {displayName}
        </div>
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 text-xs tabular-nums text-ink-muted">
            {qty}
          </span>
          <ProvenanceLine fields={fields} nowMs={nowMs} className="min-w-0" />
        </div>
      </div>
      <div className="max-w-[40%] shrink-0 text-right">
        <StatusText status={stock.band}>{stock.label}</StatusText>
      </div>
    </>
  );

  const rowClass = cn(
    'flex w-full min-h-tap items-center gap-3 rounded-2xl bg-surface px-3 py-2.5 text-left shadow-card transition-colors',
    'hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    className,
  );

  // Detail route is /pantry/:ingredientId/:formId (composite pantry key).
  const detailTo = `/pantry/${encodeURIComponent(item.ingredientId)}/${encodeURIComponent(item.formId)}`;

  if (onSelect) {
    return (
      <button
        type="button"
        className={rowClass}
        onClick={() => onSelect(item)}
        data-testid="pantry-item-row"
      >
        {body}
      </button>
    );
  }

  return (
    <Link to={detailTo} className={rowClass} data-testid="pantry-item-row">
      {body}
    </Link>
  );
}
