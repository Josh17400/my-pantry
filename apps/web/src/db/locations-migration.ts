/**
 * One-shot data migration: fold "Around the House" into Pantry, ensure Freezer.
 *
 * Existing installs seeded under the old tree have rows with
 * `parent_id = loc-around-house` and may have pantry items assigned directly to
 * that root. A seed-list change alone would leave orphans and hide items.
 *
 * Pure helpers are unit-tested; `migrateLocationsTree` runs against Drizzle.
 * Dev IndexedDB driver uses `applyLocationsTreeMigration` on the same shape.
 */

import { eq } from 'drizzle-orm';

import {
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_LOCATION_IDS,
  LEGACY_AROUND_HOUSE_ID,
  LOCATIONS_TREE_VERSION,
  META_LOCATIONS_TREE_VERSION,
} from './constants';
import { DEFAULT_LOCATIONS } from './default-locations';
import type { AppDatabase } from './domain-repository';
import { appMeta, locations, pantryItems } from './schema';

export type LocationTreeRow = {
  id: string;
  householdId: string;
  name: string;
  icon: string;
  tint: string;
  parentId: string | null;
  sortOrder: number;
};

export type PantryLocationRef = {
  householdId: string;
  ingredientId: string;
  formId: string;
  locationId: string | null;
};

export type LocationsTreeMigrationResult = {
  applied: boolean;
  previousVersion: string | null;
  version: string;
  reparentedChildren: number;
  movedItems: number;
  removedAroundHouse: boolean;
  ensuredFreezer: boolean;
};

/**
 * Pure transform of the old tree shape → new shape.
 * Used by unit tests and the in-memory dev driver.
 */
export function applyLocationsTreeMigration(input: {
  locations: LocationTreeRow[];
  pantryItems: PantryLocationRef[];
  householdId?: string;
}): {
  locations: LocationTreeRow[];
  pantryItems: PantryLocationRef[];
  reparentedChildren: number;
  movedItems: number;
  removedAroundHouse: boolean;
  ensuredFreezer: boolean;
} {
  const householdId = input.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const pantryId = DEFAULT_LOCATION_IDS.pantry;
  const freezerId = DEFAULT_LOCATION_IDS.freezer;
  const aroundId = LEGACY_AROUND_HOUSE_ID;

  let reparentedChildren = 0;
  let locs = input.locations.map((loc) => {
    if (loc.parentId === aroundId) {
      reparentedChildren += 1;
      return { ...loc, parentId: pantryId };
    }
    return { ...loc };
  });

  // Align known default children sortOrder / parent when present
  const defaultsById = new Map(DEFAULT_LOCATIONS.map((d) => [d.id, d]));
  locs = locs.map((loc) => {
    const def = defaultsById.get(loc.id);
    if (!def) return loc;
    return {
      ...loc,
      parentId: def.parentId,
      sortOrder: def.sortOrder,
      name: def.name,
      icon: def.icon,
      tint: def.tint,
    };
  });

  let movedItems = 0;
  const items = input.pantryItems.map((item) => {
    if (item.locationId === aroundId) {
      movedItems += 1;
      return { ...item, locationId: pantryId };
    }
    return { ...item };
  });

  const hadAround = locs.some((l) => l.id === aroundId);
  locs = locs.filter((l) => l.id !== aroundId);

  let ensuredFreezer = false;
  if (!locs.some((l) => l.id === freezerId)) {
    const def = DEFAULT_LOCATIONS.find((d) => d.id === freezerId)!;
    locs.push({
      id: def.id,
      householdId,
      name: def.name,
      icon: def.icon,
      tint: def.tint,
      parentId: def.parentId,
      sortOrder: def.sortOrder,
    });
    ensuredFreezer = true;
  }

  // Ensure pantry root exists (migration target)
  if (!locs.some((l) => l.id === pantryId)) {
    const def = DEFAULT_LOCATIONS.find((d) => d.id === pantryId)!;
    locs.push({
      id: def.id,
      householdId,
      name: def.name,
      icon: def.icon,
      tint: def.tint,
      parentId: def.parentId,
      sortOrder: def.sortOrder,
    });
  }

  locs.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );

  return {
    locations: locs,
    pantryItems: items,
    reparentedChildren,
    movedItems,
    removedAroundHouse: hadAround,
    ensuredFreezer,
  };
}

async function getMeta(db: AppDatabase, key: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(appMeta)
    .where(eq(appMeta.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

async function setMeta(db: AppDatabase, key: string, value: string): Promise<void> {
  await db
    .insert(appMeta)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value },
    });
}

/**
 * Run the locations-tree data migration against a real SQLite/Drizzle DB.
 * Idempotent via META_LOCATIONS_TREE_VERSION.
 */
export async function migrateLocationsTree(
  db: AppDatabase,
  options: { householdId?: string; force?: boolean } = {},
): Promise<LocationsTreeMigrationResult> {
  const householdId = options.householdId ?? DEFAULT_HOUSEHOLD_ID;
  const previousVersion = await getMeta(db, META_LOCATIONS_TREE_VERSION);

  if (previousVersion === LOCATIONS_TREE_VERSION && !options.force) {
    return {
      applied: false,
      previousVersion,
      version: LOCATIONS_TREE_VERSION,
      reparentedChildren: 0,
      movedItems: 0,
      removedAroundHouse: false,
      ensuredFreezer: false,
    };
  }

  const aroundId = LEGACY_AROUND_HOUSE_ID;
  const pantryId = DEFAULT_LOCATION_IDS.pantry;
  const freezerId = DEFAULT_LOCATION_IDS.freezer;

  // Reparent children of Around the House → Pantry
  const children = await db
    .select()
    .from(locations)
    .where(eq(locations.parentId, aroundId));
  for (const child of children) {
    await db
      .update(locations)
      .set({ parentId: pantryId })
      .where(eq(locations.id, child.id));
  }

  // Align known defaults (parent + sortOrder + display) for ids we own
  for (const def of DEFAULT_LOCATIONS) {
    const existing = await db
      .select()
      .from(locations)
      .where(eq(locations.id, def.id))
      .limit(1);
    if (existing[0]) {
      await db
        .update(locations)
        .set({
          name: def.name,
          icon: def.icon,
          tint: def.tint,
          parentId: def.parentId,
          sortOrder: def.sortOrder,
        })
        .where(eq(locations.id, def.id));
    }
  }

  // Move items assigned directly to Around the House
  const orphanItems = await db
    .select()
    .from(pantryItems)
    .where(eq(pantryItems.locationId, aroundId));
  if (orphanItems.length > 0) {
    await db
      .update(pantryItems)
      .set({ locationId: pantryId })
      .where(eq(pantryItems.locationId, aroundId));
  }

  const aroundRows = await db
    .select()
    .from(locations)
    .where(eq(locations.id, aroundId))
    .limit(1);
  if (aroundRows[0]) {
    await db.delete(locations).where(eq(locations.id, aroundId));
  }

  let ensuredFreezer = false;
  const freezerRows = await db
    .select()
    .from(locations)
    .where(eq(locations.id, freezerId))
    .limit(1);
  if (!freezerRows[0]) {
    ensuredFreezer = true;
  }

  // Ensure every default location exists (new Freezer on old installs)
  for (const def of DEFAULT_LOCATIONS) {
    await db
      .insert(locations)
      .values({
        id: def.id,
        householdId,
        name: def.name,
        icon: def.icon,
        tint: def.tint,
        parentId: def.parentId,
        sortOrder: def.sortOrder,
      })
      .onConflictDoNothing();
  }

  await setMeta(db, META_LOCATIONS_TREE_VERSION, LOCATIONS_TREE_VERSION);

  return {
    applied: true,
    previousVersion,
    version: LOCATIONS_TREE_VERSION,
    reparentedChildren: children.length,
    movedItems: orphanItems.length,
    removedAroundHouse: aroundRows.length > 0,
    ensuredFreezer,
  };
}
