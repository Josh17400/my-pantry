/** Default single-device household until auth/household sync lands. */
export const DEFAULT_HOUSEHOLD_ID = 'local-household' as const;

export const DEFAULT_DEVICE_ID = 'local-device' as const;

export const DEFAULT_USER_ID = 'local-user' as const;

/** app_meta keys */
export const META_SEED_VERSION = 'seed_version' as const;
export const META_LOCATIONS_SEEDED = 'locations_seeded' as const;
export const META_FIXTURES_VERSION = 'fixtures_version' as const;
/**
 * Data migration version for the default location tree (reparent / add Freezer /
 * remove Around the House). Independent of core SEED_VERSION so we can ship
 * tree changes without touching packages/core.
 */
export const META_LOCATIONS_TREE_VERSION = 'locations_tree_version' as const;

/**
 * Bump when the default location tree shape changes. Drives a one-shot data
 * migration on existing installs (see `locations-migration.ts`).
 */
export const LOCATIONS_TREE_VERSION = '2' as const;

/**
 * Retired root id. Still referenced by migration from older installs; not in
 * DEFAULT_LOCATION_IDS.
 */
export const LEGACY_AROUND_HOUSE_ID = 'loc-around-house' as const;

/** Default location ids (stable across restarts). */
export const DEFAULT_LOCATION_IDS = {
  fridge: 'loc-fridge',
  freezer: 'loc-freezer',
  pantry: 'loc-pantry',
  spices: 'loc-spices',
  teaCoffee: 'loc-tea-coffee',
  baking: 'loc-baking',
  household: 'loc-household',
} as const;

export type DefaultLocationId =
  (typeof DEFAULT_LOCATION_IDS)[keyof typeof DEFAULT_LOCATION_IDS];
