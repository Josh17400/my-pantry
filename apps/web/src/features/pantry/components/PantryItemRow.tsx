import { Link } from 'react-router-dom';

import type { PantryItemView } from '../../../db/types';
import { PlaceholderThumb } from '../../../ui/PlaceholderThumb';
import { StatusText } from '../../../ui/StatusText';
import { cn } from '../../../ui/cn';
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
        name={item.ingredientName}
        tint={tintFor(item.ingredientName)}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-sans text-sm font-semibold text-ink">
          {item.ingredientName}
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

  if (onSelect) {
    return (
      <button
        type="button"
        className={rowClass}
        onClick={() => onSelect(item)}
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      to={`/pantry/${encodeURIComponent(item.ingredientId)}/${encodeURIComponent(item.formId)}`}
      className={rowClass}
    >
      {body}
    </Link>
  );
}
