import { foldLedger, sliceFromLastAbsolute } from './fold';
import { compareCursors, prepareLog, txnCursor } from './order';
import { applyProvenanceIncremental, emptyProvenance } from './provenance';
import type {
  Dimension,
  FoldResult,
  PantryTxn,
  ProjectionCache,
} from './types';

/**
 * Projection cache maintenance.
 *
 * qtyBase is a CACHE. Incremental `qty += delta` in arrival order is WRONG
 * when sync inserts an out-of-order transaction. Named bug from red-team.
 *
 * Rule: re-fold when needsRefold is true; otherwise (strictly-newer relative)
 * apply the delta incrementally and advance the watermark.
 */

export type NeedsRefoldReason =
  | 'absolute'
  | 'at_or_below_watermark'
  | null;

export type NeedsRefoldResult = {
  needs: boolean;
  reason: NeedsRefoldReason;
};

/**
 * Return true when the incoming txn must trigger a re-fold of that ingredient.
 *
 * - any absolute → true
 * - incoming sorts at or below local watermark → true (out-of-order / equal)
 * - strictly newer relative with a known watermark → false (safe incremental)
 * - null watermark and relative → false (apply delta from 0 onto empty cache)
 */
export function needsRefold(
  cachedCursor: string | null,
  incomingTxn: PantryTxn,
): boolean {
  return needsRefoldDetailed(cachedCursor, incomingTxn).needs;
}

export function needsRefoldDetailed(
  cachedCursor: string | null,
  incomingTxn: PantryTxn,
): NeedsRefoldResult {
  if (incomingTxn.kind === 'absolute') {
    return { needs: true, reason: 'absolute' };
  }
  if (cachedCursor === null) {
    return { needs: false, reason: null };
  }
  const incoming = txnCursor(incomingTxn);
  if (compareCursors(incoming, cachedCursor) <= 0) {
    return { needs: true, reason: 'at_or_below_watermark' };
  }
  return { needs: false, reason: null };
}

/** True when a relative txn is a strict append after the watermark. */
export function canIncrementalApply(
  cachedCursor: string | null,
  incomingTxn: PantryTxn,
): boolean {
  return !needsRefold(cachedCursor, incomingTxn) && incomingTxn.kind === 'relative';
}

export function projectionFromFold(
  fold: FoldResult,
  meta: {
    householdId: string;
    ingredientId: string;
    formId: string;
    dim: Dimension;
  },
): ProjectionCache {
  return {
    householdId: meta.householdId,
    ingredientId: meta.ingredientId,
    formId: meta.formId,
    qtyBase: fold.qtyBase,
    dim: meta.dim,
    watermarkCursor: fold.lastTxnCursor,
    lastAbsoluteCursor: fold.lastAbsoluteCursor,
    provenance: fold.provenance,
    isNegative: fold.isNegative,
    conflict: fold.conflict,
  };
}

export function emptyProjection(meta: {
  householdId: string;
  ingredientId: string;
  formId: string;
  dim: Dimension;
}): ProjectionCache {
  return {
    householdId: meta.householdId,
    ingredientId: meta.ingredientId,
    formId: meta.formId,
    qtyBase: 0,
    dim: meta.dim,
    watermarkCursor: null,
    lastAbsoluteCursor: null,
    provenance: emptyProvenance(),
    isNegative: false,
    conflict: false,
  };
}

export const emptyProjectionCache = emptyProjection;

export type ApplyTxnResult = {
  cache: ProjectionCache;
  /** True when a (bounded) re-fold was performed. */
  refolded: boolean;
  fold: FoldResult | null;
};

/**
 * Apply one incoming txn against a projection cache.
 *
 * `logIncludingIncoming` must be the full ingredient log after merging the
 * incoming txn (de-dupe-safe). Used only on the re-fold path.
 */
export function applyIncomingTxn(
  cache: ProjectionCache,
  incoming: PantryTxn,
  logIncludingIncoming: readonly PantryTxn[],
  options?: { nowIso?: string; bounded?: boolean },
): ApplyTxnResult {
  if (needsRefold(cache.watermarkCursor, incoming)) {
    const fold = foldLedger(logIncludingIncoming, {
      bounded: options?.bounded !== false,
      nowIso: options?.nowIso,
    });
    return {
      cache: projectionFromFold(fold, {
        householdId: cache.householdId,
        ingredientId: cache.ingredientId,
        formId: cache.formId,
        dim: cache.dim,
      }),
      refolded: true,
      fold,
    };
  }

  if (incoming.kind !== 'relative') {
    const fold = foldLedger(logIncludingIncoming, {
      bounded: options?.bounded !== false,
      nowIso: options?.nowIso,
    });
    return {
      cache: projectionFromFold(fold, {
        householdId: cache.householdId,
        ingredientId: cache.ingredientId,
        formId: cache.formId,
        dim: cache.dim,
      }),
      refolded: true,
      fold,
    };
  }

  const qtyBase = cache.qtyBase + incoming.deltaBase;
  const next: ProjectionCache = {
    ...cache,
    qtyBase,
    watermarkCursor: txnCursor(incoming),
    provenance: applyProvenanceIncremental(
      cache.provenance,
      incoming,
      options?.nowIso,
    ),
    isNegative: qtyBase < 0,
  };
  return { cache: next, refolded: false, fold: null };
}

/**
 * Rebuild projection from a log (always re-folds). Bounded by default.
 */
export function rebuildProjection(
  log: readonly PantryTxn[],
  meta: {
    householdId: string;
    ingredientId: string;
    formId: string;
    dim: Dimension;
  },
  options?: { nowIso?: string; bounded?: boolean },
): { cache: ProjectionCache; fold: FoldResult } {
  const fold = foldLedger(log, {
    bounded: options?.bounded !== false,
    nowIso: options?.nowIso,
  });
  return { cache: projectionFromFold(fold, meta), fold };
}

export function projectFromLog(
  log: readonly PantryTxn[],
  meta: {
    householdId: string;
    ingredientId: string;
    formId: string;
    dim: Dimension;
  },
): { cache: ProjectionCache; fold: FoldResult } {
  return rebuildProjection(log, meta);
}

/**
 * Invariant helper: projection.qtyBase must equal fold(log).qtyBase.
 */
export function projectionMatchesFold(
  cache: ProjectionCache,
  log: readonly PantryTxn[],
): boolean {
  const fold = foldLedger(log);
  return cache.qtyBase === fold.qtyBase;
}

/**
 * Given a log and a known lastAbsoluteCursor, return the slice starting at
 * that absolute. Proves bounded walk-back: pre-checkpoint txns are skipped.
 */
export function logSliceForRefold(
  log: readonly PantryTxn[],
  lastAbsoluteCursor: string | null,
): { slice: PantryTxn[]; skippedBeforeCheckpoint: number } {
  const prepared = prepareLog(log);
  if (lastAbsoluteCursor === null) {
    return { slice: prepared, skippedBeforeCheckpoint: 0 };
  }
  const idx = prepared.findIndex((t) => txnCursor(t) === lastAbsoluteCursor);
  if (idx < 0) {
    const s = sliceFromLastAbsolute(log);
    return {
      slice: s.slice,
      skippedBeforeCheckpoint: s.txnsSkipped,
    };
  }
  return {
    slice: prepared.slice(idx),
    skippedBeforeCheckpoint: idx,
  };
}

/** Instrumentation for tests/metrics. */
export function boundedRefoldStats(txns: readonly PantryTxn[]): {
  txnsRead: number;
  txnsSkipped: number;
  total: number;
  hadCheckpoint: boolean;
} {
  const s = sliceFromLastAbsolute(txns);
  return {
    txnsRead: s.txnsConsidered,
    txnsSkipped: s.txnsSkipped,
    total: s.ordered.length,
    hadCheckpoint: s.lastAbsoluteCursor !== null,
  };
}
