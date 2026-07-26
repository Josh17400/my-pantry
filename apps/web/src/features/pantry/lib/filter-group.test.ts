import { describe, expect, it } from 'vitest';

import type { PantryItemView } from '../../../db/types';
import type { LocationRow } from '../../../db/types';
import {
  filterPantryItems,
  flattenGroups,
  groupByLocation,
  matchesFilter,
  matchesSearch,
} from './filter-group';

const NOW = Date.parse('2026-07-26T12:00:00.000Z');

function item(partial: Partial<PantryItemView> & Pick<PantryItemView, 'ingredientId' | 'ingredientName'>): PantryItemView {
  return {
    householdId: 'local-household',
    formId: `${partial.ingredientId}-form`,
    locationId: 'loc-pantry',
    qtyBase: 100,
    dim: 'mass',
    parLevelBase: 200,
    lowThresholdPct: 0.25,
    lastVerifiedAt: new Date(NOW - 86400000).toISOString(),
    unverifiedCookCount: 0,
    openedAt: null,
    expiresAt: null,
    updatedAt: new Date(NOW).toISOString(),
    watermarkCursor: null,
    lastAbsoluteCursor: null,
    isNegative: false,
    conflict: false,
    formName: 'default',
    locationName: 'Pantry',
    ...partial,
  };
}

const locations: LocationRow[] = [
  {
    id: 'loc-fridge',
    householdId: 'h',
    name: 'Fridge',
    icon: 'fridge',
    tint: '#6B8F9C',
    parentId: null,
    sortOrder: 0,
  },
  {
    id: 'loc-pantry',
    householdId: 'h',
    name: 'Pantry',
    icon: 'pantry',
    tint: '#C4A574',
    parentId: null,
    sortOrder: 1,
  },
];

describe('search + filter', () => {
  const flour = item({
    ingredientId: 'flour',
    ingredientName: 'All-Purpose Flour',
    qtyBase: 500,
    parLevelBase: 2000,
    lowThresholdPct: 0.25,
  });
  const milk = item({
    ingredientId: 'milk',
    ingredientName: 'Milk',
    locationId: 'loc-fridge',
    locationName: 'Fridge',
    qtyBase: 0,
    parLevelBase: 1000,
    dim: 'volume',
    formId: 'milk-liquid',
  });
  const spinach = item({
    ingredientId: 'spinach',
    ingredientName: 'Spinach',
    locationId: 'loc-fridge',
    locationName: 'Fridge',
    qtyBase: 200,
    parLevelBase: 200,
    expiresAt: new Date(NOW + 2 * 86400000).toISOString(),
    formId: 'spinach-fresh',
  });

  it('matchesSearch is case-insensitive on name', () => {
    expect(matchesSearch(flour, 'flour')).toBe(true);
    expect(matchesSearch(flour, 'FLOUR')).toBe(true);
    expect(matchesSearch(flour, 'xyz')).toBe(false);
  });

  it('filter low / out / expiring', () => {
    // flour 500/2000 = 0.25 → low at default threshold 0.25
    expect(matchesFilter(flour, 'low', NOW)).toBe(true);
    expect(matchesFilter(milk, 'out', NOW)).toBe(true);
    expect(matchesFilter(spinach, 'expiring', NOW)).toBe(true);
    expect(matchesFilter(flour, 'expiring', NOW)).toBe(false);
  });

  it('filterPantryItems composes query + filter', () => {
    const all = [flour, milk, spinach];
    const out = filterPantryItems(all, { filter: 'out', nowMs: NOW });
    expect(out.map((i) => i.ingredientId)).toEqual(['milk']);

    const q = filterPantryItems(all, { query: 'spin', filter: 'all', nowMs: NOW });
    expect(q).toHaveLength(1);
    expect(q[0]!.ingredientId).toBe('spinach');
  });
});

describe('groupByLocation + flatten', () => {
  it('orders by location sortOrder and flattens headers', () => {
    const items = [
      item({
        ingredientId: 'flour',
        ingredientName: 'Flour',
        locationId: 'loc-pantry',
        locationName: 'Pantry',
      }),
      item({
        ingredientId: 'milk',
        ingredientName: 'Milk',
        locationId: 'loc-fridge',
        locationName: 'Fridge',
        formId: 'milk-liquid',
      }),
    ];
    const groups = groupByLocation(items, locations);
    expect(groups.map((g) => g.locationName)).toEqual(['Fridge', 'Pantry']);

    const flat = flattenGroups(groups);
    expect(flat[0]).toMatchObject({ kind: 'header', title: 'Fridge' });
    expect(flat.some((r) => r.kind === 'item')).toBe(true);
    expect(flat.filter((r) => r.kind === 'item')).toHaveLength(2);
  });
});
