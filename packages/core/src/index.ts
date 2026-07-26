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
  computeChecksum,
  batchValues,
  HEALTH_PROBE_ROW_COUNT,
  HEALTH_PROBE_DDL,
  HEALTH_PROBE_DROP,
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
  ALLERGENS,
  ALLERGEN_SET,
  DIETARY_FLAGS,
  DIETARY_FLAG_SET,
  allergensDisagree,
  canAutoMergeAllergens,
  canAutoMergeDietaryFlags,
  canAutoMergeSafety,
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
  UnitId,
  UnitDef,
  ConversionOk,
  ConversionErr,
  ConversionFailReason,
  ConversionResult,
  ConvertInput,
  ParseQuantityResult,
  ParsedQuantity,
  ParsedNonQuantified,
  ParsedUnparsed,
  FormatOpts,
} from './units';

export {
  BASE_UNIT,
  DIMENSION_OF_BASE,
  UNIT_DEFS,
  UNIT_BY_ID,
  UNIT_BY_ALIAS,
  EXACT,
  toBaseFactor,
  dimensionOf,
  resolveUnitId,
  isKnownUnit,
  convert,
  convertBaseToUnit,
  convertToBase,
  uniqueEdgeKeys,
  edgeKey,
  inverseEdgeKey,
  parseQuantity,
  formatQuantity,
  decimalsForUncertainty,
} from './units';

// ── Pantry (ledger fold, projection, par, stock) ────────────────────────────
// Omit Dimension / QtyBase re-export — domain is canonical.

export type {
  AbsoluteConflict,
  AbsoluteReason,
  AbsoluteTxn,
  Confidence,
  FoldResult,
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
  FoldOptions,
  ApplyTxnResult,
  NeedsRefoldReason,
  NeedsRefoldResult,
  EvaluateStockOptions,
  NegativeStockSignal,
} from './pantry';

export {
  CONSUMPTION_REASONS,
  VERIFYING_REASONS,
  compareCursors,
  compareTxnOrder,
  compareTxns,
  dedupeByClientTxnId,
  prepareLog,
  prepareLogDetailed,
  sortAndDedupe,
  sortTxns,
  txnCursor,
  absolutesConflict,
  checkpointSlice,
  detectAbsoluteConflicts,
  findLastAbsoluteIndex,
  foldLedger,
  foldLedgerBounded,
  indexOfLastAbsolute,
  lastAbsoluteCursor,
  sliceFromCheckpoint,
  sliceFromLastAbsolute,
  sumRelativeDeltas,
  applyIncomingTxn,
  boundedRefoldStats,
  canIncrementalApply,
  emptyProjection,
  emptyProjectionCache,
  logSliceForRefold,
  needsRefold,
  needsRefoldDetailed,
  projectFromLog,
  projectionFromFold,
  projectionMatchesFold,
  rebuildProjection,
  applyProvenanceIncremental,
  bandConfidence,
  buildProvenance,
  classifyConfidence,
  computeProvenanceFromOrdered,
  confidenceFrom,
  DRIFTING_MAX_COOKS,
  emptyProvenance,
  foldProvenance,
  isAbsoluteTxn,
  isConsumptionReason,
  isRelativeTxn,
  isVerifyReason,
  PROVENANCE_THRESHOLDS,
  STALE_AGE_MS,
  VERIFIED_MAX_AGE_MS,
  BULK_DAYS_BETWEEN,
  BULK_LOW_THRESHOLD_PCT,
  computeParLevel,
  DEFAULT_LOW_THRESHOLD_PCT,
  DEFAULT_PAR_BASE,
  filterSeasonalPurchases,
  FREQUENT_DAYS_BETWEEN,
  FREQUENT_LOW_THRESHOLD_PCT,
  LONG_CADENCE_DAYS,
  LONG_CADENCE_LOW_THRESHOLD_PCT,
  median,
  medianDaysBetweenPurchases,
  MIN_PURCHASES_TO_LEARN,
  mostRecentContiguousRun,
  packageSeed,
  purchasesFromDeltas,
  SEASONAL_GAP_DAYS,
  SEASONAL_GAP_MS,
  selectLowThresholdPct,
  STAPLE_LOW_THRESHOLD_PCT,
  DEFAULT_STOCK_EPSILON,
  evaluateLowOutBatch,
  evaluateStock,
  evaluateStockBatch,
  negativeStockSignal,
  OUT_EPSILON,
  wouldGoNegative,
} from './pantry';
