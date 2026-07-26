export { createPantryRepository } from './create-repository';
export { shouldUseBrowserDevDriver } from './drivers/dev-gate';
export { runHealthCheck } from './health-check';
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
  appMeta,
  conversionEdges,
  groceryListItems,
  groceryLists,
  healthProbe,
  ingredientForms,
  ingredients,
  locations,
  packageSpecs,
  pantryItems,
  pantryTxns,
  recipeLines,
  recipes,
  recipeSteps,
  schema,
  userAliases,
} from './schema';
// Dev driver: import from './drivers/dev' in tests / console reset — keep out of
// the default app graph so production hosts don't parse the IndexedDB store.
export {
  DEFAULT_DEVICE_ID,
  DEFAULT_HOUSEHOLD_ID,
  DEFAULT_LOCATION_IDS,
  DEFAULT_USER_ID,
} from './constants';
export { DomainRepository } from './domain-repository';
export {
  buildFixtureItems,
  buildFixtureRecipes,
  FIXTURES_VERSION,
  generateDevFixtures,
} from './fixtures';
export { runMigrations } from './migrate';
export { runSeed, seedCatalogStats } from './seed';
export type * from './types';
// NodeSqliteRepository is test-only (better-sqlite3) — import from
// './drivers/node-sqlite' in tests, never from the app bundle.
