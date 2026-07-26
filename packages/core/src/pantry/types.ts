/**
 * Pantry ledger types — two event kinds (relative | absolute).
 *
 * Dimension and QtyBase come from `src/domain/` (single definition). Units
 * owns conversion math; this module owns ledger / projection / stock shapes.
 */

import type { Dimension, QtyBase } from '../domain/types';

export type { Dimension, QtyBase };

/** Relative reasons commute under union (pure deltas). */
export type RelativeReason =
  | 'purchase'
  | 'cook'
  | 'quick'
  | 'waste'
  | 'adjust_delta';

/** Absolute reason — non-commutative; LWW by total order. */
export type AbsoluteReason = 'recount';

export type TxnReason = RelativeReason | AbsoluteReason;

/** Reasons that re-verify stock (reset provenance cook counter). */
export const VERIFYING_REASONS: ReadonlySet<TxnReason> = new Set([
  'purchase',
  'recount',
]);

/**
 * Relative consumption reasons that increment unverifiedCookCount.
 * adjust_delta is manual and does not count as an unverified cook.
 */
export const CONSUMPTION_REASONS: ReadonlySet<RelativeReason> = new Set([
  'cook',
  'quick',
  'waste',
]);

type PantryTxnBase = {
  id: string;
  /** Idempotency key — UNIQUE(householdId, clientTxnId). */
  clientTxnId: string;
  householdId: string;
  ingredientId: string;
  formId: string;
  refId?: string;
  unitPrice?: number;
  /**
   * Client clock (ISO-8601). Used in the total-order triple.
   * Not trustworthy alone under skew; acceptedAt is the server clock.
   */
  occurredAt: string;
  /** Server clock when accepted (ISO-8601). Optional until sync. */
  acceptedAt?: string;
  deviceId: string;
  userId: string;
};

export type RelativeTxn = PantryTxnBase & {
  kind: 'relative';
  reason: RelativeReason;
  deltaBase: number;
};

export type AbsoluteTxn = PantryTxnBase & {
  kind: 'absolute';
  reason: AbsoluteReason;
  targetBase: number;
  /**
   * Cursor of the max txn this device had seen when writing the absolute.
   * Used to detect concurrent absolutes (device had not seen the other recount).
   */
  basisCursor?: string;
};

export type PantryTxn = RelativeTxn | AbsoluteTxn;

/** Confidence band for UI provenance display. */
export type Confidence = 'verified' | 'drifting' | 'stale';

export type Provenance = {
  lastVerifiedAt: string | null;
  unverifiedCookCount: number;
  confidence: Confidence;
};

export type AbsoluteConflict = {
  /** The absolute that won (later in total order). */
  winner: AbsoluteTxn;
  /** Prior absolute(s) that lost (concurrent / unobserved). */
  losers: AbsoluteTxn[];
};

export type FoldResult = {
  qtyBase: number;
  /** True when concurrent absolutes disagreed and LWW picked a winner. */
  conflict: boolean;
  conflictDetail: AbsoluteConflict | null;
  /**
   * Cursor of the last absolute in total order (checkpoint).
   * Null if the log has no absolute events.
   */
  lastAbsoluteCursor: string | null;
  /** Cursor of the last txn in total order (projection watermark). */
  lastTxnCursor: string | null;
  provenance: Provenance;
  /** Final quantity is strictly below zero — UI should prompt, not clamp. */
  isNegative: boolean;
  /**
   * How many txns the fold actually considered after checkpoint slice.
   * Used to prove bounded walk-back.
   */
  txnsConsidered: number;
  /** How many ordered txns were skipped before the checkpoint. */
  txnsSkipped: number;
};

/** Cached projection row — qtyBase is a cache, not source of truth. */
export type ProjectionCache = {
  householdId: string;
  ingredientId: string;
  formId: string;
  qtyBase: number;
  dim: Dimension;
  /** Total-order cursor of last txn folded into this cache. */
  watermarkCursor: string | null;
  lastAbsoluteCursor: string | null;
  provenance: Provenance;
  isNegative: boolean;
  conflict: boolean;
};

/** Minimal package seed for par cold-start (mirror of PackageSpec.net in base units). */
export type PackageSeed = {
  formId: string;
  label: string;
  /** Net quantity in base units (g/ml/each) for the form's dimension. */
  netBase: number;
};

export type PurchaseEvent = {
  qtyBase: number;
  occurredAt: string;
};

export type StockStatus = 'ok' | 'low' | 'out' | 'negative';

export type StockEvaluation = {
  status: StockStatus;
  qtyBase: number;
  parLevelBase: number;
  /** qty/par when par > 0; null when par is zero/undefined. */
  ratio: number | null;
  lowThresholdPct: number;
  /** Distinct signal: qty < 0 — prompt "still have some?", do not clamp. */
  needsNegativePrompt: boolean;
  isNegative: boolean;
};

export type StockItemInput = {
  /** Caller-defined key (ingredientId, or ingredientId+formId). */
  key: string;
  qtyBase: number;
  parLevelBase: number;
  lowThresholdPct?: number;
  epsilon?: number;
};

export type StockBrief = {
  out: Array<StockEvaluation & { key: string }>;
  low: Array<StockEvaluation & { key: string }>;
  negative: Array<StockEvaluation & { key: string }>;
  /** Union of out + low + negative for one daily shopping brief. */
  brief: Array<StockEvaluation & { key: string }>;
};

export type ParSource = 'override' | 'learned' | 'seed' | 'default';

export type ParComputeInput = {
  packageSeed?: PackageSeed | null;
  purchases: readonly PurchaseEvent[];
  userOverrideBase?: number | null;
  isStaple?: boolean;
  seasonalTag?: boolean;
  lowThresholdPct?: number | null;
};

export type ParComputeResult = {
  parLevelBase: number;
  source: ParSource;
  medianPurchaseQty: number | null;
  medianDaysBetween: number | null;
  lowThresholdPct: number;
  purchasesUsed: number;
  purchasesDropped: number;
};
