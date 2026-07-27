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

export type LocationSelectOption = {
  id: string;
  name: string;
  /** 0 = root, 1 = child — for indentation / grouping in dropdowns */
  depth: number;
  /** Display label with hierarchy (e.g. "  Spices" under Pantry) */
  label: string;
  parentId: string | null;
  sortOrder: number;
};

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
 * Hierarchical options for location dropdowns: roots first, then children
 * indented under each parent so Pantry → Spices / Baking / etc. is legible.
 */
export function locationSelectOptions(
  locations: readonly LocationRow[],
): LocationSelectOption[] {
  const roots = locations
    .filter((l) => l.parentId == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const childrenOf = (parentId: string) =>
    locations
      .filter((l) => l.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const options: LocationSelectOption[] = [];
  for (const root of roots) {
    options.push({
      id: root.id,
      name: root.name,
      depth: 0,
      label: root.name,
      parentId: null,
      sortOrder: root.sortOrder,
    });
    for (const child of childrenOf(root.id)) {
      options.push({
        id: child.id,
        name: child.name,
        depth: 1,
        label: `↳ ${child.name}`,
        parentId: child.parentId,
        sortOrder: child.sortOrder,
      });
    }
  }

  // Orphans (parent missing from list) — append so nothing is silently dropped
  const listed = new Set(options.map((o) => o.id));
  for (const loc of locations) {
    if (listed.has(loc.id)) continue;
    options.push({
      id: loc.id,
      name: loc.name,
      depth: loc.parentId ? 1 : 0,
      label: loc.parentId ? `↳ ${loc.name}` : loc.name,
      parentId: loc.parentId,
      sortOrder: loc.sortOrder,
    });
  }

  return options;
}

/**
 * Scope for a location filter: the location itself plus all direct children.
 * Opening Pantry therefore includes Spices / Baking / etc. items.
 */
export function expandLocationScope(
  locationId: string,
  locations: readonly LocationRow[],
): Set<string> {
  const childIds = locations
    .filter((l) => l.parentId === locationId)
    .map((l) => l.id);
  return new Set([locationId, ...childIds]);
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
