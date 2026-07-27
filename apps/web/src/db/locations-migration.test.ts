/**
 * Locations tree migration: old shape (Around the House) → new shape (Freezer + Pantry children).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_LOCATION_IDS,
  LEGACY_AROUND_HOUSE_ID,
  LOCATIONS_TREE_VERSION,
} from './constants';
import { DEFAULT_LOCATIONS } from './default-locations';
import { NodeSqliteRepository } from './drivers/node-sqlite';
import {
  applyLocationsTreeMigration,
  migrateLocationsTree,
} from './locations-migration';
import { locations, pantryItems } from './schema';

/** Old default tree as shipped before Freezer / Pantry reparent. */
function oldTreeLocations(householdId = DEFAULT_HOUSEHOLD_ID) {
  return [
    {
      id: DEFAULT_LOCATION_IDS.fridge,
      householdId,
      name: 'Fridge',
      icon: 'fridge',
      tint: '#6B8F9C',
      parentId: null as string | null,
      sortOrder: 0,
    },
    {
      id: DEFAULT_LOCATION_IDS.pantry,
      householdId,
      name: 'Pantry',
      icon: 'pantry',
      tint: '#C4A574',
      parentId: null,
      sortOrder: 1,
    },
    {
      id: LEGACY_AROUND_HOUSE_ID,
      householdId,
      name: 'Around the House',
      icon: 'home',
      tint: '#8B9A7D',
      parentId: null,
      sortOrder: 2,
    },
    {
      id: DEFAULT_LOCATION_IDS.spices,
      householdId,
      name: 'Spices',
      icon: 'spice',
      tint: '#B85C38',
      parentId: LEGACY_AROUND_HOUSE_ID,
      sortOrder: 3,
    },
    {
      id: DEFAULT_LOCATION_IDS.teaCoffee,
      householdId,
      name: 'Tea & Coffee',
      icon: 'mug',
      tint: '#6F4E37',
      parentId: LEGACY_AROUND_HOUSE_ID,
      sortOrder: 4,
    },
    {
      id: DEFAULT_LOCATION_IDS.baking,
      householdId,
      name: 'Baking',
      icon: 'whisk',
      tint: '#D4A5A5',
      parentId: LEGACY_AROUND_HOUSE_ID,
      sortOrder: 5,
    },
    {
      id: DEFAULT_LOCATION_IDS.household,
      householdId,
      name: 'Household',
      icon: 'broom',
      tint: '#7A8B8B',
      parentId: LEGACY_AROUND_HOUSE_ID,
      sortOrder: 6,
    },
  ];
}

describe('applyLocationsTreeMigration (pure)', () => {
  it('reparents Around the House children to Pantry, moves items, removes root, adds Freezer', () => {
    const householdId = DEFAULT_HOUSEHOLD_ID;
    const inputItems = [
      {
        householdId,
        ingredientId: 'cumin',
        formId: 'cumin-bulk',
        locationId: DEFAULT_LOCATION_IDS.spices,
      },
      {
        householdId,
        ingredientId: 'spare-batteries',
        formId: 'batteries-each',
        locationId: LEGACY_AROUND_HOUSE_ID,
      },
      {
        householdId,
        ingredientId: 'milk',
        formId: 'milk-liquid',
        locationId: DEFAULT_LOCATION_IDS.fridge,
      },
    ];

    const result = applyLocationsTreeMigration({
      locations: oldTreeLocations(householdId),
      pantryItems: inputItems,
      householdId,
    });

    expect(result.removedAroundHouse).toBe(true);
    expect(result.ensuredFreezer).toBe(true);
    expect(result.reparentedChildren).toBe(4);
    expect(result.movedItems).toBe(1);

    const ids = result.locations.map((l) => l.id);
    expect(ids).not.toContain(LEGACY_AROUND_HOUSE_ID);
    expect(ids).toContain(DEFAULT_LOCATION_IDS.freezer);
    expect(ids).toContain(DEFAULT_LOCATION_IDS.pantry);

    // No orphan parents
    const idSet = new Set(ids);
    for (const loc of result.locations) {
      if (loc.parentId != null) {
        expect(idSet.has(loc.parentId)).toBe(true);
        expect(loc.parentId).not.toBe(LEGACY_AROUND_HOUSE_ID);
      }
    }

    // Children now under Pantry
    const spices = result.locations.find(
      (l) => l.id === DEFAULT_LOCATION_IDS.spices,
    );
    expect(spices?.parentId).toBe(DEFAULT_LOCATION_IDS.pantry);

    // Item that lived on Around the House moved to Pantry — not lost
    const moved = result.pantryItems.find(
      (i) => i.ingredientId === 'spare-batteries',
    );
    expect(moved?.locationId).toBe(DEFAULT_LOCATION_IDS.pantry);

    // Item already on Spices stays on Spices (still valid under Pantry)
    const cumin = result.pantryItems.find((i) => i.ingredientId === 'cumin');
    expect(cumin?.locationId).toBe(DEFAULT_LOCATION_IDS.spices);

    // Fridge item untouched
    const milk = result.pantryItems.find((i) => i.ingredientId === 'milk');
    expect(milk?.locationId).toBe(DEFAULT_LOCATION_IDS.fridge);

    // Item count preserved
    expect(result.pantryItems).toHaveLength(inputItems.length);
  });

  it('is a no-op shape when already on the new tree', () => {
    const householdId = DEFAULT_HOUSEHOLD_ID;
    const locs = DEFAULT_LOCATIONS.map((d) => ({
      id: d.id,
      householdId,
      name: d.name,
      icon: d.icon,
      tint: d.tint,
      parentId: d.parentId,
      sortOrder: d.sortOrder,
    }));
    const result = applyLocationsTreeMigration({
      locations: locs,
      pantryItems: [
        {
          householdId,
          ingredientId: 'frozen-peas',
          formId: 'frozen-peas-bulk',
          locationId: DEFAULT_LOCATION_IDS.freezer,
        },
      ],
      householdId,
    });
    expect(result.removedAroundHouse).toBe(false);
    expect(result.ensuredFreezer).toBe(false);
    expect(result.reparentedChildren).toBe(0);
    expect(result.locations).toHaveLength(DEFAULT_LOCATIONS.length);
  });
});

describe('migrateLocationsTree (sqlite)', () => {
  let repo: NodeSqliteRepository;

  beforeEach(async () => {
    repo = new NodeSqliteRepository({ path: ':memory:' });
    await repo.open();
    await repo.migrate();
  });

  afterEach(async () => {
    await repo.close();
  });

  it('migrates an install that still has Around the House', async () => {
    const householdId = DEFAULT_HOUSEHOLD_ID;
    const db = repo.drizzle;

    // Seed the OLD tree + an item on the retired root
    for (const loc of oldTreeLocations(householdId)) {
      await db.insert(locations).values(loc);
    }
    const now = new Date().toISOString();
    await db.insert(pantryItems).values({
      householdId,
      ingredientId: 'granola-bar',
      formId: 'granola-bar-bulk',
      locationId: LEGACY_AROUND_HOUSE_ID,
      qtyBase: 4,
      dim: 'count',
      parLevelBase: 12,
      lowThresholdPct: 0.4,
      lastVerifiedAt: now,
      unverifiedCookCount: 0,
      openedAt: null,
      expiresAt: null,
      updatedAt: now,
      watermarkCursor: null,
      lastAbsoluteCursor: null,
      isNegative: false,
      conflict: false,
    });
    await db.insert(pantryItems).values({
      householdId,
      ingredientId: 'cumin',
      formId: 'cumin-bulk',
      locationId: DEFAULT_LOCATION_IDS.spices,
      qtyBase: 20,
      dim: 'mass',
      parLevelBase: 40,
      lowThresholdPct: 0.25,
      lastVerifiedAt: now,
      unverifiedCookCount: 0,
      openedAt: null,
      expiresAt: null,
      updatedAt: now,
      watermarkCursor: null,
      lastAbsoluteCursor: null,
      isNegative: false,
      conflict: false,
    });

    const first = await migrateLocationsTree(db, { householdId });
    expect(first.applied).toBe(true);
    expect(first.version).toBe(LOCATIONS_TREE_VERSION);
    expect(first.removedAroundHouse).toBe(true);
    expect(first.reparentedChildren).toBe(4);
    expect(first.movedItems).toBe(1);
    expect(first.ensuredFreezer).toBe(true);

    const locs = await db.select().from(locations);
    const locIds = locs.map((l) => l.id);
    expect(locIds).not.toContain(LEGACY_AROUND_HOUSE_ID);
    expect(locIds).toContain(DEFAULT_LOCATION_IDS.freezer);
    expect(locs).toHaveLength(7);

    // No orphan parents
    for (const loc of locs) {
      if (loc.parentId) {
        expect(locIds).toContain(loc.parentId);
      }
    }

    const spices = locs.find((l) => l.id === DEFAULT_LOCATION_IDS.spices);
    expect(spices?.parentId).toBe(DEFAULT_LOCATION_IDS.pantry);

    const items = await db.select().from(pantryItems);
    expect(items).toHaveLength(2);
    const granola = items.find((i) => i.ingredientId === 'granola-bar');
    expect(granola?.locationId).toBe(DEFAULT_LOCATION_IDS.pantry);
    const cumin = items.find((i) => i.ingredientId === 'cumin');
    expect(cumin?.locationId).toBe(DEFAULT_LOCATION_IDS.spices);

    // Idempotent
    const second = await migrateLocationsTree(db, { householdId });
    expect(second.applied).toBe(false);
    const locs2 = await db.select().from(locations);
    expect(locs2).toHaveLength(7);
    const items2 = await db.select().from(pantryItems);
    expect(items2).toHaveLength(2);
  });

  it('fresh seed produces the new tree with Freezer and no Around the House', async () => {
    await repo.seed();
    const locs = await repo.domain().listLocations();
    expect(locs.map((l) => l.id)).not.toContain(LEGACY_AROUND_HOUSE_ID);
    expect(locs.map((l) => l.id)).toContain(DEFAULT_LOCATION_IDS.freezer);
    expect(locs).toHaveLength(7);

    const pantryKids = locs.filter(
      (l) => l.parentId === DEFAULT_LOCATION_IDS.pantry,
    );
    expect(pantryKids.map((l) => l.name).sort()).toEqual(
      ['Baking', 'Household', 'Spices', 'Tea & Coffee'].sort(),
    );

    const roots = locs
      .filter((l) => l.parentId == null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(roots.map((r) => r.name)).toEqual(['Fridge', 'Freezer', 'Pantry']);
  });
});
