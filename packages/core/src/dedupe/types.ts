/**
 * Household de-duplication shapes.
 *
 * Union-merge is correct for a bank and wrong for a pantry: two people
 * logging the same dinner must not deduct twice. These pure helpers return
 * decisions only — this module never writes transactions.
 */

/** Prior cook event in the household log (minimal fields for de-dupe). */
export type CookLogEvent = {
  readonly cookEventId: string;
  readonly recipeId: string;
  readonly occurredAt: string;
  readonly userId: string;
  readonly deviceId?: string;
  /** Optional display name for UI ("Alex"). */
  readonly userDisplayName?: string;
};

export type CookCandidate = {
  readonly recipeId: string;
  /** Defaults to `now()` when omitted. */
  readonly occurredAt?: string;
};

export type FindDuplicateCookOptions = {
  /** Default 3 hours. */
  readonly windowMs?: number;
  /** Injected clock. */
  readonly now?: () => Date;
};

/**
 * When a prior cook of the same recipe falls inside the window.
 * Merge is the UX default; UI offers separate batch as the alternate.
 */
export type DuplicateCookHit = {
  readonly prior: CookLogEvent;
  readonly windowMs: number;
  readonly deltaMs: number;
  /** Default action for the UI. */
  readonly defaultAction: 'merge';
};

export type ReceiptFingerprintInput = {
  readonly store: string;
  /** Calendar or ISO date; normalized to YYYY-MM-DD. */
  readonly date: string;
  /** Total in major currency units (e.g. dollars). Compared to cents. */
  readonly total: number;
  readonly lineCount: number;
};

export type ReceiptRecord = ReceiptFingerprintInput & {
  readonly fingerprint: string;
  /** ISO or YYYY-MM-DD of the prior receipt. */
  readonly date: string;
};

/**
 * Exact: identical fingerprint → block second commit.
 * Near: same store, within 7 days, totals/lines close but not exact → warn.
 * Distinct: ok to commit.
 */
export type ReceiptDedupeDecision =
  | {
      readonly kind: 'block';
      readonly reason: 'exact-match';
      readonly prior: ReceiptRecord;
    }
  | {
      readonly kind: 'warn';
      readonly reason: 'near-match';
      readonly prior: ReceiptRecord;
      readonly dayDiff: number;
      readonly totalDiffCents: number;
      readonly lineCountDiff: number;
    }
  | {
      readonly kind: 'ok';
    };

export type CheckReceiptOptions = {
  /** Near-match window; default 7 days. */
  readonly nearWindowDays?: number;
  /**
   * Absolute total difference (cents) allowed for near-match when line counts
   * are equal. Default 100 ($1.00).
   */
  readonly nearTotalCents?: number;
  /**
   * Line-count difference allowed when totals match exactly. Default 1.
   */
  readonly nearLineCountSlop?: number;
};

/** One line on a shopping trip (check-off or receipt). */
export type TripLine = {
  readonly ingredientId: string;
  readonly formId?: string;
  readonly qtyBase: number;
  readonly lineId?: string;
};

export type ReconcileTripInput = {
  readonly shoppingTripId: string;
  readonly checkedOff: readonly TripLine[];
  readonly receiptLines: readonly TripLine[];
};

export type ReconciledMatch = {
  readonly status: 'match';
  readonly ingredientId: string;
  readonly formId?: string;
  /** Single qty to land in pantry (receipt preferred when both present). */
  readonly qtyBase: number;
  readonly checkoffQty: number;
  readonly receiptQty: number;
};

export type ReconciledExtra = {
  readonly status: 'extra';
  /** On receipt but not checked off. */
  readonly ingredientId: string;
  readonly formId?: string;
  readonly qtyBase: number;
  readonly source: 'receipt';
};

export type ReconciledMissing = {
  readonly status: 'missing';
  /** Checked off but not on receipt. */
  readonly ingredientId: string;
  readonly formId?: string;
  readonly qtyBase: number;
  readonly source: 'checkoff';
};

export type PantryCommitLine = {
  readonly ingredientId: string;
  readonly formId?: string;
  readonly qtyBase: number;
  readonly provenance: 'reconciled' | 'receipt-only' | 'checkoff-only';
};

/**
 * Trip reconciliation: match / extra / missing, plus a single-count
 * pantry commit list so rice does not land twice.
 */
export type TripReconciliation = {
  readonly shoppingTripId: string;
  readonly matches: readonly ReconciledMatch[];
  readonly extra: readonly ReconciledExtra[];
  readonly missing: readonly ReconciledMissing[];
  readonly pantryCommits: readonly PantryCommitLine[];
};
