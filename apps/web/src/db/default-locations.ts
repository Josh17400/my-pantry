/**
 * Canonical default location tree for The Good Pantry.
 *
 * Fridge · Freezer · Pantry (roots)
 *   Pantry → Spices, Tea & Coffee, Baking, Household
 *
 * Freezer tint: frost slate `#5E7A86` — cooler than Fridge's muted blue-slate
 * (`#6B8F9C`) so it reads cold, but desaturated with a warm-gray cast so it
 * does not introduce a pure tech blue against the warm-shifted palette
 * (DESIGN.md: warmth is the rule; sky wash is `#CCD4D4`).
 */

import { DEFAULT_LOCATION_IDS } from './constants';

export type DefaultLocationDef = {
  id: string;
  name: string;
  icon: string;
  tint: string;
  parentId: string | null;
  sortOrder: number;
};

export const DEFAULT_LOCATIONS: readonly DefaultLocationDef[] = [
  {
    id: DEFAULT_LOCATION_IDS.fridge,
    name: 'Fridge',
    icon: 'fridge',
    tint: '#6B8F9C',
    parentId: null,
    sortOrder: 0,
  },
  {
    id: DEFAULT_LOCATION_IDS.freezer,
    name: 'Freezer',
    icon: 'snowflake',
    // Frost slate — cold read without pure blue (see file header).
    tint: '#5E7A86',
    parentId: null,
    sortOrder: 1,
  },
  {
    id: DEFAULT_LOCATION_IDS.pantry,
    name: 'Pantry',
    icon: 'pantry',
    tint: '#C4A574',
    parentId: null,
    sortOrder: 2,
  },
  {
    id: DEFAULT_LOCATION_IDS.spices,
    name: 'Spices',
    icon: 'spice',
    tint: '#B85C38',
    parentId: DEFAULT_LOCATION_IDS.pantry,
    sortOrder: 3,
  },
  {
    id: DEFAULT_LOCATION_IDS.teaCoffee,
    name: 'Tea & Coffee',
    icon: 'mug',
    tint: '#6F4E37',
    parentId: DEFAULT_LOCATION_IDS.pantry,
    sortOrder: 4,
  },
  {
    id: DEFAULT_LOCATION_IDS.baking,
    name: 'Baking',
    icon: 'whisk',
    tint: '#D4A5A5',
    parentId: DEFAULT_LOCATION_IDS.pantry,
    sortOrder: 5,
  },
  {
    id: DEFAULT_LOCATION_IDS.household,
    name: 'Household',
    icon: 'broom',
    tint: '#7A8B8B',
    parentId: DEFAULT_LOCATION_IDS.pantry,
    sortOrder: 6,
  },
] as const;
