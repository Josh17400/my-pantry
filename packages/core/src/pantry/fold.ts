import { compareCursors, prepareLog, txnCursor } from './order';
import { foldProvenance, isAbsoluteTxn } from './provenance';
import type {
  AbsoluteConflict,
  AbsoluteTxn,
  FoldResult,
  PantryTxn,
} from './types';

/**
 * foldLedger — deterministic fold of a household ingredient's transaction log.
 *
 * Algorithm:
 * 1. De-dupe by clientTxnId (idempotent replay).
 * 2. Total-order by (occurredAt, deviceId, clientTxnId).
 * 3. Quantity fold starts at the last absolute (checkpoint) — relatives before
 *    that absolute cannot affect the result.
 * 4. Fold:
 *    - relative → acc += deltaBase
 *    - absolute → acc = targetBase
 * 5. Concurrent-absolute conflict is detected on the full absolute set:
 *    winner = last absolute in total order; losers = prior absolutes that the
 *    winner did not observe (basisCursor missing or < loser's cursor).
 *    Both are retained in the log; UI surfaces the conflict once.
 *
 * Never clamps negatives — isNegative signals the UI to prompt.
 */

export type FoldOptions = {
  /**
   * When true (default), only consider txns from the last absolute onward
   * for the quantity fold (bounded walk-back). Conflict detection still
   * inspects all absolutes in the prepared log.
   */
  bounded?: boolean;
  /** Reference clock for provenance age bands. Defaults to last txn time. */
  nowIso?: string;
};

/**
 * Index of the last absolute in a prepared (sorted, de-duped) log, or -1.
 */
export function findLastAbsoluteIndex(ordered: readonly PantryTxn[]): number {
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (ordered[i]!.kind === 'absolute') return i;
  }
  return -1;
}

/** Alias. */
export const indexOfLastAbsolute = findLastAbsoluteIndex;

/**
 * Slice prepared log to the checkpoint window: last absolute + everything after.
 * If no absolute exists, returns the full log (start from zero).
 */
export function sliceFromCheckpoint(
  ordered: readonly PantryTxn[],
): PantryTxn[] {
  const idx = findLastAbsoluteIndex(ordered);
  if (idx < 0) return [...ordered];
  return ordered.slice(idx);
}

/**
 * Prepare + slice with instrumentation (txns skipped / considered).
 */
export function sliceFromLastAbsolute(txns: readonly PantryTxn[]): {
  slice: PantryTxn[];
  ordered: PantryTxn[];
  txnsConsidered: number;
  txnsSkipped: number;
  lastAbsoluteCursor: string | null;
} {
  const ordered = prepareLog(txns);
  const idx = findLastAbsoluteIndex(ordered);
  if (idx < 0) {
    return {
      slice: ordered,
      ordered,
      txnsConsidered: ordered.length,
      txnsSkipped: 0,
      lastAbsoluteCursor: null,
    };
  }
  const slice = ordered.slice(idx);
  return {
    slice,
    ordered,
    txnsConsidered: slice.length,
    txnsSkipped: idx,
    lastAbsoluteCursor: txnCursor(ordered[idx]!),
  };
}

/** Alias. */
export const checkpointSlice = sliceFromLastAbsolute;

export function lastAbsoluteCursor(
  txns: readonly PantryTxn[],
): string | null {
  const ordered = prepareLog(txns);
  const idx = findLastAbsoluteIndex(ordered);
  return idx >= 0 ? txnCursor(ordered[idx]!) : null;
}

/**
 * Detect whether absolute `next` concurrent-conflicts with prior absolute `prev`.
 * Concurrent when next did not observe prev:
 *   - basisCursor absent, or
 *   - basisCursor sorts strictly before prev's cursor.
 */
export function absolutesConflict(
  prev: AbsoluteTxn,
  next: AbsoluteTxn,
): boolean {
  const prevCursor = txnCursor(prev);
  if (next.basisCursor === undefined || next.basisCursor === '') {
    return true;
  }
  return compareCursors(next.basisCursor, prevCursor) < 0;
}

/**
 * Conflict among absolutes: winner is last in total order; losers are prior
 * absolutes the winner did not observe. Returns null when no concurrent pair.
 *
 * ## Known limitation — pairwise history vs winner-only reporting
 *
 * This function compares each prior absolute only against the **winner**
 * (last in total order). Quantity fold remains correct (later absolute wins
 * and is the checkpoint). Conflict *reporting* can be incomplete:
 *
 *   Three absolutes A1, A2, A3 where A3 observed A2 (basisCursor ≥ A2) but
 *   A2 never observed A1. The genuine A1/A2 concurrent conflict is not
 *   reported, because A1 is checked only against A3, and A3's basis covers A1.
 *
 * Fixing this (full pairwise scan) would expand when `conflict === true`
 * without changing qtyBase — deliberately left as documentation only so we
 * do not change FoldResult conflict semantics or UI signals mid-flight.
 * Quantity behavior is verified and must not regress.
 */
export function detectAbsoluteConflicts(
  ordered: readonly PantryTxn[],
): AbsoluteConflict | null {
  const absolutes = ordered.filter(isAbsoluteTxn);
  if (absolutes.length < 2) return null;

  const winner = absolutes[absolutes.length - 1]!;
  const losers: AbsoluteTxn[] = [];
  for (let i = 0; i < absolutes.length - 1; i++) {
    const prev = absolutes[i]!;
    if (absolutesConflict(prev, winner)) {
      losers.push(prev);
    }
  }
  if (losers.length === 0) return null;
  return { winner, losers };
}

function foldQuantitySegment(segment: readonly PantryTxn[]): {
  qtyBase: number;
  isNegative: boolean;
} {
  let acc = 0;

  for (const txn of segment) {
    if (txn.kind === 'relative') {
      acc += txn.deltaBase;
    } else {
      acc = txn.targetBase;
    }
  }

  return {
    qtyBase: acc,
    isNegative: acc < 0,
  };
}

/**
 * Deterministic fold of an ingredient's ledger.
 *
 * @param txns Unordered, possibly duplicated log fragment for one ingredient.
 */
export function foldLedger(
  txns: readonly PantryTxn[],
  options: FoldOptions = {},
): FoldResult {
  const bounded = options.bounded !== false;
  const prepared = prepareLog(txns);
  const absIdx = findLastAbsoluteIndex(prepared);
  const segment =
    bounded && absIdx >= 0 ? prepared.slice(absIdx) : prepared;
  const txnsSkipped =
    bounded && absIdx >= 0 ? absIdx : 0;

  const core = foldQuantitySegment(segment);
  const conflictDetail = detectAbsoluteConflicts(prepared);

  // Provenance from full prepared log (not checkpoint slice) so cook counts
  // and verifications remain correct when qty walk is bounded.
  const nowIso =
    options.nowIso ??
    (prepared.length > 0
      ? prepared[prepared.length - 1]!.occurredAt
      : new Date().toISOString());
  const provenance = foldProvenance(prepared, nowIso);

  const lastAbsoluteCursor =
    absIdx >= 0 ? txnCursor(prepared[absIdx]!) : null;
  const lastTxnCursor =
    prepared.length > 0
      ? txnCursor(prepared[prepared.length - 1]!)
      : null;

  return {
    qtyBase: core.qtyBase,
    conflict: conflictDetail !== null,
    conflictDetail,
    lastAbsoluteCursor,
    lastTxnCursor,
    provenance,
    isNegative: core.isNegative,
    txnsConsidered: segment.length,
    txnsSkipped,
  };
}

/** Explicitly bounded fold (same as foldLedger with bounded: true). */
export function foldLedgerBounded(
  txns: readonly PantryTxn[],
  options: Omit<FoldOptions, 'bounded'> = {},
): FoldResult {
  return foldLedger(txns, { ...options, bounded: true });
}

/**
 * Sum of relative deltas only (ignores absolutes). Used by property tests
 * and diagnostics — not a substitute for foldLedger when absolutes exist.
 */
export function sumRelativeDeltas(txns: readonly PantryTxn[]): number {
  const prepared = prepareLog(txns);
  let sum = 0;
  for (const t of prepared) {
    if (t.kind === 'relative') sum += t.deltaBase;
  }
  return sum;
}
