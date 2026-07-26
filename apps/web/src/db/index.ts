export type {
  AggregateResult,
  HealthRunResult,
  HealthStepName,
  HealthStepResult,
  InitializeResult,
  PantryRepository,
  VerifyResult,
} from './repository';
export { batchValues, computeChecksum, NotConfiguredError } from './repository';
export {
  healthProbe,
  schema,
  locations,
  ingredients,
  ingredientForms,
  conversionEdges,
  packageSpecs,
  pantryItems,
  pantryTxns,
  recipes,
  recipeLines,
  recipeSteps,
  groceryLists,
  groceryListItems,
  userAliases,
  appMeta,
} from './schema';
export { runHealthCheck } from './health-check';
export { createPantryRepository } from './create-repository';
export { shouldUseBrowserDevDriver } from './drivers/dev-gate';
// Dev driver: import from './drivers/dev' in tests / console reset — keep out of
// the default app graph so production hosts don't parse the IndexedDB store.
export { runMigrations } from './migrate';
export { runSeed, seedCatalogStats } from './seed';
export { DomainRepository } from './domain-repository';
export {
  generateDevFixtures,
  buildFixtureItems,
  buildFixtureRecipes,
  FIXTURES_VERSION,
} from './fixtures';
export {
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_DEVICE_ID,
  DEFAULT_USER_ID,
  DEFAULT_LOCATION_IDS,
} from './constants';
export type * from './types';
// NodeSqliteRepository is test-only (better-sqlite3) — import from
// './drivers/node-sqlite' in tests, never from the app bundle.
