/** Default single-device household until auth/household sync lands. */
export const DEFAULT_HOUSEHOLD_ID = 'local-household' as const;

export const DEFAULT_DEVICE_ID = 'local-device' as const;

export const DEFAULT_USER_ID = 'local-user' as const;

/** app_meta keys */
export const META_SEED_VERSION = 'seed_version' as const;
export const META_LOCATIONS_SEEDED = 'locations_seeded' as const;
export const META_FIXTURES_VERSION = 'fixtures_version' as const;

/** Default location ids (stable across restarts). */
export const DEFAULT_LOCATION_IDS = {
  fridge: 'loc-fridge',
  pantry: 'loc-pantry',
  aroundHouse: 'loc-around-house',
  spices: 'loc-spices',
  teaCoffee: 'loc-tea-coffee',
  baking: 'loc-baking',
  household: 'loc-household',
} as const;

export type DefaultLocationId =
  (typeof DEFAULT_LOCATION_IDS)[keyof typeof DEFAULT_LOCATION_IDS];
