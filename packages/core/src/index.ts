/**
 * @larder/core — pure TypeScript domain logic.
 * Zero React, zero React Native, zero platform APIs.
 *
 * Public surface: domain vocabulary, units math, pantry ledger, M0 health.
 */

export const CORE_PACKAGE_NAME = '@larder/core' as const;

export function coreHealth(): { ok: true; package: typeof CORE_PACKAGE_NAME } {
  return { ok: true, package: CORE_PACKAGE_NAME };
}

export {
  batchValues,
  computeChecksum,
  HEALTH_PROBE_DDL,
  HEALTH_PROBE_DROP,
  HEALTH_PROBE_ROW_COUNT,
} from './sqlite-health';

// ── Domain vocabulary (canonical shapes) ────────────────────────────────────
// Dimension / IngredientForm / ConversionEdge / PackageSpec / QtyBase live here.
// units and pantry re-export a subset; root prefers domain as the type home.

export type {
  Allergen,
  AllergenTags,
  BaseUnit,
  ConversionEdge,
  DietaryFlag,
  DietaryTags,
  Dimension,
  Ingredient,
  IngredientForm,
  Location,
  PackageSpec,
  QtyBase,
} from './domain';
export {
  ALLERGEN_SET,
  ALLERGENS,
  allergensDisagree,
  canAutoMergeAllergens,
  canAutoMergeDietaryFlags,
  canAutoMergeSafety,
  DIETARY_FLAG_SET,
  DIETARY_FLAGS,
  dietaryFlagsDisagree,
  ingredientHitsAvoidList,
  isAllergen,
  isDietaryFlag,
  knownAllergens,
  knownDietaryFlags,
  safetyTagsDisagree,
  unknownAllergenTags,
  unknownDietaryTags,
} from './domain';

// ── Units (math + registry + parse/format) ──────────────────────────────────
// Deliberately omit re-export of Dimension / IngredientForm / ConversionEdge /
// PackageSpec / BaseUnit — those come from domain above (one definition).

export type {
  ConversionErr,
  ConversionFailReason,
  ConversionOk,
  ConversionResult,
  ConvertInput,
  FormatOpts,
  ParsedNonQuantified,
  ParsedQuantity,
  ParsedUnparsed,
  ParseQuantityResult,
  UnitDef,
  UnitId,
} from './units';
export {
  BASE_UNIT,
  convert,
  convertBaseToUnit,
  convertToBase,
  decimalsForUncertainty,
  DIMENSION_OF_BASE,
  dimensionOf,
  edgeKey,
  EXACT,
  formatQuantity,
  inverseEdgeKey,
  isKnownUnit,
  parseQuantity,
  resolveUnitId,
  toBaseFactor,
  uniqueEdgeKeys,
  UNIT_BY_ALIAS,
  UNIT_BY_ID,
  UNIT_DEFS,
} from './units';

// ── Pantry (ledger fold, projection, par, stock) ────────────────────────────
// Omit Dimension / QtyBase re-export — domain is canonical.

export type {
  AbsoluteConflict,
  AbsoluteReason,
  AbsoluteTxn,
  ApplyTxnResult,
  Confidence,
  EvaluateStockOptions,
  FoldOptions,
  FoldResult,
  NeedsRefoldReason,
  NeedsRefoldResult,
  NegativeStockSignal,
  PackageSeed,
  PantryTxn,
  ParComputeInput,
  ParComputeResult,
  ParSource,
  ProjectionCache,
  Provenance,
  PurchaseEvent,
  RelativeReason,
  RelativeTxn,
  StockBrief,
  StockEvaluation,
  StockItemInput,
  StockStatus,
  TxnReason,
} from './pantry';
export {
  absolutesConflict,
  applyIncomingTxn,
  applyProvenanceIncremental,
  bandConfidence,
  boundedRefoldStats,
  buildProvenance,
  BULK_DAYS_BETWEEN,
  BULK_LOW_THRESHOLD_PCT,
  canIncrementalApply,
  checkpointSlice,
  classifyConfidence,
  compareCursors,
  compareTxnOrder,
  compareTxns,
  computeParLevel,
  computeProvenanceFromOrdered,
  confidenceFrom,
  CONSUMPTION_REASONS,
  dedupeByClientTxnId,
  DEFAULT_LOW_THRESHOLD_PCT,
  DEFAULT_PAR_BASE,
  DEFAULT_STOCK_EPSILON,
  detectAbsoluteConflicts,
  DRIFTING_MAX_COOKS,
  emptyProjection,
  emptyProjectionCache,
  emptyProvenance,
  evaluateLowOutBatch,
  evaluateStock,
  evaluateStockBatch,
  filterSeasonalPurchases,
  findLastAbsoluteIndex,
  foldLedger,
  foldLedgerBounded,
  foldProvenance,
  FREQUENT_DAYS_BETWEEN,
  FREQUENT_LOW_THRESHOLD_PCT,
  indexOfLastAbsolute,
  isAbsoluteTxn,
  isConsumptionReason,
  isRelativeTxn,
  isVerifyReason,
  lastAbsoluteCursor,
  logSliceForRefold,
  LONG_CADENCE_DAYS,
  LONG_CADENCE_LOW_THRESHOLD_PCT,
  median,
  medianDaysBetweenPurchases,
  MIN_PURCHASES_TO_LEARN,
  mostRecentContiguousRun,
  needsRefold,
  needsRefoldDetailed,
  negativeStockSignal,
  OUT_EPSILON,
  packageSeed,
  prepareLog,
  prepareLogDetailed,
  projectFromLog,
  projectionFromFold,
  projectionMatchesFold,
  PROVENANCE_THRESHOLDS,
  purchasesFromDeltas,
  rebuildProjection,
  SEASONAL_GAP_DAYS,
  SEASONAL_GAP_MS,
  selectLowThresholdPct,
  sliceFromCheckpoint,
  sliceFromLastAbsolute,
  sortAndDedupe,
  sortTxns,
  STALE_AGE_MS,
  STAPLE_LOW_THRESHOLD_PCT,
  sumRelativeDeltas,
  txnCursor,
  VERIFIED_MAX_AGE_MS,
  VERIFYING_REASONS,
  wouldGoNegative,
} from './pantry';

// ── Ingredient seed catalog ─────────────────────────────────────────────────
// Same shapes as deep-import consumers; root re-export for app seed wiring.

export type {
  SeedCatalog,
  SeedCategoryBundle,
  SeedIngredient,
  SeedValidationCode,
  SeedValidationIssue,
  SeedValidationResult,
} from './seed';
export {
  assertSeedValid,
  countByCategory,
  SEED_CATEGORIES,
  SEED_VERSION,
  seedCatalog,
  seedEdges,
  seedForms,
  seedIngredients,
  seedPackages,
  validateSeed,
} from './seed';

// ── Starter recipe catalogue (~50 household recipes) ────────────────────────
// Data lives in seed/recipes; export only — no recipe logic changes here.

export type { RecipeDef } from './seed/recipes';
export {
  countStarterRecipes,
  getStarterRecipe,
  STARTER_RECIPE_CATEGORIES,
  starterRecipes,
} from './seed/recipes';
