/**
 * @larder/core/dedupe — cook / receipt / trip household de-duplication.
 *
 * Pure TypeScript. Zero React, zero platform APIs, zero I/O.
 * Never writes transactions — decisions only.
 * Root barrel (`src/index.ts`) is owned by another track — do not edit it.
 */

export {
  DEFAULT_COOK_WINDOW_MS,
  findDuplicateCook,
} from './cook';
export {
  checkReceiptDuplicate,
  DEFAULT_NEAR_LINE_SLOP,
  DEFAULT_NEAR_TOTAL_CENTS,
  DEFAULT_NEAR_WINDOW_DAYS,
  fnv1aHex,
  normalizeReceiptDate,
  normalizeStore,
  receiptFingerprint,
  toCents,
  toReceiptRecord,
} from './receipt';
export { reconcileTrip } from './trip';
export type {
  CheckReceiptOptions,
  CookCandidate,
  CookLogEvent,
  DuplicateCookHit,
  FindDuplicateCookOptions,
  PantryCommitLine,
  ReceiptDedupeDecision,
  ReceiptFingerprintInput,
  ReceiptRecord,
  ReconciledExtra,
  ReconciledMatch,
  ReconciledMissing,
  ReconcileTripInput,
  TripLine,
  TripReconciliation,
} from './types';
