/**
 * @larder/core/pantry — ledger fold, projection cache, par levels, provenance.
 *
 * Pure TypeScript. Zero React, zero platform APIs, zero I/O.
 * Truth is fold(log); PantryItem.qtyBase is a cache.
 *
 * Root barrel (`src/index.ts`) is owned by another track — do not edit it.
 * Export surface lives here; architect wires root at integration.
 */

// Types
export type {
  AbsoluteConflict,
  AbsoluteReason,
  AbsoluteTxn,
  Confidence,
  Dimension,
  FoldResult,
  PackageSeed,
  PantryTxn,
  ParComputeInput,
  ParComputeResult,
  ParSource,
  ProjectionCache,
  Provenance,
  PurchaseEvent,
  QtyBase,
  RelativeReason,
  RelativeTxn,
  StockBrief,
  StockEvaluation,
  StockItemInput,
  StockStatus,
  TxnReason,
} from './types';
export { CONSUMPTION_REASONS, VERIFYING_REASONS } from './types';

// Total order
export {
  compareCursors,
  compareTxnOrder,
  compareTxns,
  dedupeByClientTxnId,
  prepareLog,
  prepareLogDetailed,
  sortAndDedupe,
  sortTxns,
  txnCursor,
} from './order';

// Fold
export type { FoldOptions } from './fold';
export {
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
} from './fold';

// Projection
export type { ApplyTxnResult, NeedsRefoldReason, NeedsRefoldResult } from './projection';
export {
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
} from './projection';

// Provenance
export {
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
} from './provenance';

// Par levels
export {
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
} from './par';

// Stock / low-out
export type { EvaluateStockOptions, NegativeStockSignal } from './stock';
export {
  DEFAULT_STOCK_EPSILON,
  evaluateLowOutBatch,
  evaluateStock,
  evaluateStockBatch,
  negativeStockSignal,
  OUT_EPSILON,
  wouldGoNegative,
} from './stock';
