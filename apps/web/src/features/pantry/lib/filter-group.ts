/**
 * Client-side filter + location grouping for the pantry list.
 * Pure — safe to unit-test without React or SQLite.
 */

import type { PantryItemView } from '../../../db/types';
import type { LocationRow } from '../../../db/types';
import { isExpiringSoon, resolveStockUi } from './stock-display';

export type PantryFilter = 'all' | 'low' | 'out' | 'expiring';

export type PantryListItem = PantryItemView;

export type LocationGroup = {
  locationId: string | null;
  locationName: string;
  sortOrder: number;
  items: PantryListItem[];
};

export type FlatRow =
  | { kind: 'header'; key: string; title: string; count: number }
  | { kind: 'item'; key: string; item: PantryListItem };

export function matchesSearch(item: PantryListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const hay = [
    item.ingredientName,
    item.formName ?? '',
    item.locationName ?? '',
    item.ingredientId,
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function matchesFilter(
  item: PantryListItem,
  filter: PantryFilter,
  nowMs: number = Date.now(),
): boolean {
  if (filter === 'all') return true;

  if (filter === 'expiring') {
    return isExpiringSoon(item.expiresAt, nowMs);
  }

  const ui = resolveStockUi(
    {
      qtyBase: item.qtyBase,
      parLevelBase: item.parLevelBase,
      lowThresholdPct: item.lowThresholdPct,
      expiresAt: item.expiresAt,
      isNegative: item.isNegative,
    },
    nowMs,
  );

  if (filter === 'low') return ui.stockStatus === 'low';
  if (filter === 'out') {
    return ui.stockStatus === 'out' || ui.stockStatus === 'negative';
  }
  return true;
}

export function filterPantryItems(
  items: readonly PantryListItem[],
  opts: {
    query?: string;
    filter?: PantryFilter;
    nowMs?: number;
  } = {},
): PantryListItem[] {
  const query = opts.query ?? '';
  const filter = opts.filter ?? 'all';
  const nowMs = opts.nowMs ?? Date.now();

  return items.filter(
    (item) => matchesSearch(item, query) && matchesFilter(item, filter, nowMs),
  );
}

/**
 * Group by location, ordered by location sortOrder then name.
 * Unknown / null locations land in "Unassigned" at the end.
 */
export function groupByLocation(
  items: readonly PantryListItem[],
  locations: readonly LocationRow[] = [],
): LocationGroup[] {
  const locById = new Map(locations.map((l) => [l.id, l]));
  const buckets = new Map<string | null, PantryListItem[]>();

  for (const item of items) {
    const key = item.locationId;
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }

  const groups: LocationGroup[] = [];
  for (const [locationId, groupItems] of buckets) {
    const loc = locationId ? locById.get(locationId) : undefined;
    const locationName =
      loc?.name ?? groupItems[0]?.locationName ?? (locationId ? 'Location' : 'Unassigned');
    const sortOrder = loc?.sortOrder ?? (locationId ? 500 : 9999);
    groups.push({
      locationId,
      locationName,
      sortOrder,
      items: [...groupItems].sort((a, b) =>
        a.ingredientName.localeCompare(b.ingredientName),
      ),
    });
  }

  groups.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.locationName.localeCompare(b.locationName);
  });

  return groups;
}

/** Flatten groups into virtualized list rows (sticky headers + items). */
export function flattenGroups(groups: readonly LocationGroup[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const g of groups) {
    const key = g.locationId ?? 'unassigned';
    rows.push({
      kind: 'header',
      key: `h:${key}`,
      title: g.locationName,
      count: g.items.length,
    });
    for (const item of g.items) {
      rows.push({
        kind: 'item',
        key: `i:${item.ingredientId}:${item.formId}`,
        item,
      });
    }
  }
  return rows;
}
