import type {
  AbsoluteTxn,
  Confidence,
  PantryTxn,
  Provenance,
  RelativeTxn,
} from './types';
import { CONSUMPTION_REASONS, VERIFYING_REASONS } from './types';

/**
 * Provenance thresholds (confidence bands).
 *
 * verified  — last purchase/recount exists, zero unverified cooks, verified
 *             within VERIFIED_MAX_AGE_MS (30 days).
 *             UI: "✓ receipt · 2 days ago"
 *
 * drifting  — 1..DRIFTING_MAX_COOKS unverified cooks, or verified age in
 *             (30d, STALE_AGE_MS] with no cooks.
 *             UI: "⚠ 3 cooks since last verified"
 *
 * stale     — never verified, OR cook count > DRIFTING_MAX_COOKS, OR last
 *             verified older than STALE_AGE_MS (90 days).
 *             UI: "⚠ estimated · never verified"
 *
 * Why these numbers:
 * - 30d verified window: once a cook lands we leave verified immediately
 *   (cook count > 0). Age alone without cooks soft-degrades after 30d so
 *   forgotten items do not look fresh forever.
 * - drifting up to 4 cooks: matches the flour example ("3 cooks since…") as
 *   drifting, not yet stale — user still has a recent verification anchor.
 * - 5+ cooks or 90d: numbers are noise; force "stale" so UI never implies
 *   precision the ledger cannot defend.
 */
export const VERIFIED_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const STALE_AGE_MS = 90 * 24 * 60 * 60 * 1000;
export const DRIFTING_MAX_COOKS = 4;

export const PROVENANCE_THRESHOLDS = {
  verifiedMaxAgeMs: VERIFIED_MAX_AGE_MS,
  staleMaxAgeMs: STALE_AGE_MS,
  staleCookCount: DRIFTING_MAX_COOKS + 1,
  driftingCookCount: 1,
} as const;

export function emptyProvenance(): Provenance {
  return {
    lastVerifiedAt: null,
    unverifiedCookCount: 0,
    confidence: 'stale',
  };
}

/**
 * Compute confidence from raw provenance fields and a reference "now".
 */
export function confidenceFrom(
  lastVerifiedAt: string | null,
  unverifiedCookCount: number,
  nowIso: string,
): Confidence {
  if (lastVerifiedAt === null) {
    return 'stale';
  }
  if (unverifiedCookCount > DRIFTING_MAX_COOKS) {
    return 'stale';
  }

  const now = Date.parse(nowIso);
  const verified = Date.parse(lastVerifiedAt);
  if (!Number.isFinite(now) || !Number.isFinite(verified)) {
    if (unverifiedCookCount === 0) return 'verified';
    if (unverifiedCookCount <= DRIFTING_MAX_COOKS) return 'drifting';
    return 'stale';
  }

  const age = now - verified;
  if (age > STALE_AGE_MS) {
    return 'stale';
  }
  if (unverifiedCookCount === 0 && age <= VERIFIED_MAX_AGE_MS) {
    return 'verified';
  }
  if (unverifiedCookCount === 0 && age > VERIFIED_MAX_AGE_MS) {
    return 'drifting';
  }
  return 'drifting';
}

/** Alias. */
export const bandConfidence = (
  lastVerifiedAt: string | null,
  unverifiedCookCount: number,
  asOfMs: number = Date.now(),
): Confidence =>
  confidenceFrom(
    lastVerifiedAt,
    unverifiedCookCount,
    new Date(asOfMs).toISOString(),
  );

export const classifyConfidence = bandConfidence;

export function buildProvenance(
  lastVerifiedAt: string | null,
  unverifiedCookCount: number,
  nowIso: string,
): Provenance {
  return {
    lastVerifiedAt,
    unverifiedCookCount,
    confidence: confidenceFrom(lastVerifiedAt, unverifiedCookCount, nowIso),
  };
}

/**
 * Fold provenance across a prepared (sorted, de-duped) log segment.
 * `nowIso` is the reference clock for confidence age bands.
 */
export function foldProvenance(
  ordered: readonly PantryTxn[],
  nowIso?: string,
): Provenance {
  let lastVerifiedAt: string | null = null;
  let unverifiedCookCount = 0;

  for (const txn of ordered) {
    if (VERIFYING_REASONS.has(txn.reason)) {
      lastVerifiedAt = txn.occurredAt;
      unverifiedCookCount = 0;
      continue;
    }
    if (txn.kind === 'relative' && CONSUMPTION_REASONS.has(txn.reason)) {
      unverifiedCookCount += 1;
    }
  }

  const ref =
    nowIso ??
    (ordered.length > 0
      ? ordered[ordered.length - 1]!.occurredAt
      : new Date(0).toISOString());

  return buildProvenance(lastVerifiedAt, unverifiedCookCount, ref);
}

export const computeProvenanceFromOrdered = foldProvenance;

/**
 * Incremental provenance update for a single newly-applied txn that is known
 * to sort strictly after the current watermark (no re-fold path).
 */
export function applyProvenanceIncremental(
  prev: Provenance,
  txn: PantryTxn,
  nowIso?: string,
): Provenance {
  let lastVerifiedAt = prev.lastVerifiedAt;
  let unverifiedCookCount = prev.unverifiedCookCount;

  if (VERIFYING_REASONS.has(txn.reason)) {
    lastVerifiedAt = txn.occurredAt;
    unverifiedCookCount = 0;
  } else if (
    txn.kind === 'relative' &&
    CONSUMPTION_REASONS.has((txn as RelativeTxn).reason)
  ) {
    unverifiedCookCount += 1;
  }

  const ref = nowIso ?? txn.occurredAt;
  return buildProvenance(lastVerifiedAt, unverifiedCookCount, ref);
}

export function isAbsoluteTxn(txn: PantryTxn): txn is AbsoluteTxn {
  return txn.kind === 'absolute';
}

export function isRelativeTxn(txn: PantryTxn): txn is RelativeTxn {
  return txn.kind === 'relative';
}

export function isVerifyReason(reason: string): boolean {
  return VERIFYING_REASONS.has(reason as never);
}

export function isConsumptionReason(reason: string): boolean {
  return CONSUMPTION_REASONS.has(reason as never);
}
