import type {
  PackageSeed,
  ParComputeInput,
  ParComputeResult,
  PurchaseEvent,
} from './types';

/**
 * Par-level learning and low-threshold selection.
 *
 * Spec:
 * - Seed from PackageSpec (netBase).
 * - Learn from median purchase quantity after 3+ purchases.
 * - Factor median days-between-purchase (bulk vs high-churn) via threshold.
 * - Seasonal guard: purchases > ~4 months apart must not naively feed median
 *   (Thanksgiving turkey must not read LOW in March).
 * - User override wins when set.
 *
 * Seasonal rule:
 *   SEASONAL_GAP_MS = 120 days (~4 months).
 *   Sort purchases by occurredAt. Keep the most recent contiguous run where
 *   consecutive gaps are ≤ SEASONAL_GAP_MS. Annual turkey → run length 1 →
 *   fall back to package seed (cannot learn with < 3 purchases).
 *
 * lowThresholdPct:
 *   default 0.25; staples 0.35; bulk cadence (≥60d) raises to ≥0.40 so 25 lb
 *   rice is not first flagged at ~6 lb; frequent cadence (≤5d) lowers to 0.20
 *   to reduce milk-style alert fatigue.
 *
 * Learned par = medianPurchaseQty * cadenceFactor, where
 *   cadenceFactor = clamp(coverageDays / medianDaysBetween, 1..4)
 *   coverageDays = 7 (staple) or 14 (default).
 * Cadence also raises bulk low thresholds. Median keeps alternating packages stable.
 */

/** ~4 months in milliseconds. */
export const SEASONAL_GAP_MS = 120 * 24 * 60 * 60 * 1000;

/** ~4 months in days. */
export const SEASONAL_GAP_DAYS = 120;

/** Minimum purchases (after seasonal filter) before learning replaces seed. */
export const MIN_PURCHASES_TO_LEARN = 3;

/** Default LOW threshold: qty/par ≤ 0.25. */
export const DEFAULT_LOW_THRESHOLD_PCT = 0.25;

/** Staples alert a bit earlier (more buffer before actual empty). */
export const STAPLE_LOW_THRESHOLD_PCT = 0.35;

/** Fallback when no package seed and no history. */
export const DEFAULT_PAR_BASE = 0;

/**
 * Long purchase cycle (bulk): alert earlier so 25 lb rice is not first
 * flagged at ~6 lb (0.25 * 25).
 */
export const BULK_DAYS_BETWEEN = 60;
export const BULK_LOW_THRESHOLD_PCT = 0.4;
export const LONG_CADENCE_DAYS = BULK_DAYS_BETWEEN;
export const LONG_CADENCE_LOW_THRESHOLD_PCT = BULK_LOW_THRESHOLD_PCT;

/**
 * High-frequency cycle (milk every few days): slightly lower threshold to
 * reduce alert fatigue between normal restocks.
 */
export const FREQUENT_DAYS_BETWEEN = 5;
export const FREQUENT_LOW_THRESHOLD_PCT = 0.2;

function parseTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Keep the most recent contiguous run where consecutive gaps ≤ SEASONAL_GAP_MS.
 */
export function filterSeasonalPurchases(
  purchases: readonly PurchaseEvent[],
  gapMs: number = SEASONAL_GAP_MS,
): { kept: PurchaseEvent[]; dropped: number } {
  if (purchases.length === 0) {
    return { kept: [], dropped: 0 };
  }
  const sorted = [...purchases].sort(
    (a, b) => parseTime(a.occurredAt) - parseTime(b.occurredAt),
  );

  let runStart = sorted.length - 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    const gap =
      parseTime(sorted[i]!.occurredAt) - parseTime(sorted[i - 1]!.occurredAt);
    if (gap > gapMs) {
      runStart = i;
      break;
    }
    runStart = i - 1;
  }

  const kept = sorted.slice(runStart);
  return { kept, dropped: sorted.length - kept.length };
}

/** Most recent contiguous run (day-gap API). */
export function mostRecentContiguousRun(
  purchases: readonly PurchaseEvent[],
  maxGapDays: number = SEASONAL_GAP_DAYS,
): PurchaseEvent[] {
  return filterSeasonalPurchases(purchases, maxGapDays * 24 * 60 * 60 * 1000)
    .kept;
}

/** Median of a non-empty number array. */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('median() requires a non-empty array');
  }
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 0) {
    return (s[mid - 1]! + s[mid]!) / 2;
  }
  return s[mid]!;
}

/** Median days between consecutive purchases (sorted). Null if < 2 purchases. */
export function medianDaysBetweenPurchases(
  purchases: readonly PurchaseEvent[],
): number | null {
  if (purchases.length < 2) return null;
  const sorted = [...purchases].sort(
    (a, b) => parseTime(a.occurredAt) - parseTime(b.occurredAt),
  );
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const ms =
      parseTime(sorted[i]!.occurredAt) - parseTime(sorted[i - 1]!.occurredAt);
    gaps.push(ms / (24 * 60 * 60 * 1000));
  }
  return median(gaps);
}

/**
 * Select low-threshold from cadence + staple flags.
 * Explicit input.lowThresholdPct wins when provided.
 */
export function selectLowThresholdPct(input: {
  lowThresholdPct?: number | null;
  isStaple?: boolean;
  medianDaysBetween: number | null;
}): number {
  if (
    input.lowThresholdPct !== undefined &&
    input.lowThresholdPct !== null &&
    Number.isFinite(input.lowThresholdPct)
  ) {
    return input.lowThresholdPct;
  }

  let t = input.isStaple
    ? STAPLE_LOW_THRESHOLD_PCT
    : DEFAULT_LOW_THRESHOLD_PCT;

  const days = input.medianDaysBetween;
  if (days !== null) {
    if (days >= BULK_DAYS_BETWEEN) {
      t = Math.max(t, BULK_LOW_THRESHOLD_PCT);
    } else if (days <= FREQUENT_DAYS_BETWEEN) {
      // High-churn (milk every few days): lower threshold so the item does
      // not read LOW constantly between normal restocks — including staples.
      t = Math.min(t, FREQUENT_LOW_THRESHOLD_PCT);
    }
  }

  return t;
}

/**
 * Compute par level and recommended low threshold for one ingredient/form.
 */
export function computeParLevel(input: ParComputeInput): ParComputeResult {
  const { kept, dropped } = filterSeasonalPurchases(input.purchases);
  const purchasesUsed = kept.length;
  const purchasesDropped = dropped;

  const medianPurchaseQty =
    purchasesUsed > 0 ? median(kept.map((p) => p.qtyBase)) : null;
  const medianDaysBetween = medianDaysBetweenPurchases(kept);

  const lowThresholdPct = selectLowThresholdPct({
    lowThresholdPct: input.lowThresholdPct,
    isStaple: input.isStaple,
    medianDaysBetween,
  });

  // 1. User override always wins.
  if (
    input.userOverrideBase !== undefined &&
    input.userOverrideBase !== null &&
    Number.isFinite(input.userOverrideBase) &&
    input.userOverrideBase > 0
  ) {
    return {
      parLevelBase: input.userOverrideBase,
      source: 'override',
      medianPurchaseQty,
      medianDaysBetween,
      lowThresholdPct,
      purchasesUsed,
      purchasesDropped,
    };
  }

  // 2. Learned median after enough in-season purchases.
  const canLearn =
    purchasesUsed >= MIN_PURCHASES_TO_LEARN &&
    medianPurchaseQty !== null &&
    medianPurchaseQty > 0;

  if (canLearn) {
    // Cadence multiplier: frequent buyers (milk every 3d) keep ~1 week of
    // cover as par; bulk rare buyers (rice every 90d) keep par ≈ one unit.
    let factor = 1;
    if (medianDaysBetween !== null && medianDaysBetween > 0) {
      const coverageDays = input.isStaple ? 7 : 14;
      factor = Math.min(4, Math.max(1, coverageDays / medianDaysBetween));
    }
    return {
      parLevelBase: medianPurchaseQty * factor,
      source: 'learned',
      medianPurchaseQty,
      medianDaysBetween,
      lowThresholdPct,
      purchasesUsed,
      purchasesDropped,
    };
  }

  // 3. Package seed.
  if (input.packageSeed && input.packageSeed.netBase > 0) {
    return {
      parLevelBase: input.packageSeed.netBase,
      source: 'seed',
      medianPurchaseQty,
      medianDaysBetween,
      lowThresholdPct,
      purchasesUsed,
      purchasesDropped,
    };
  }

  // 4. Last-resort: largest single purchase seen (unfiltered), else 0.
  if (input.purchases.length > 0) {
    const maxQty = Math.max(...input.purchases.map((p) => p.qtyBase));
    return {
      parLevelBase: maxQty > 0 ? maxQty : DEFAULT_PAR_BASE,
      source: 'default',
      medianPurchaseQty,
      medianDaysBetween,
      lowThresholdPct,
      purchasesUsed,
      purchasesDropped,
    };
  }

  return {
    parLevelBase: DEFAULT_PAR_BASE,
    source: 'default',
    medianPurchaseQty,
    medianDaysBetween,
    lowThresholdPct,
    purchasesUsed,
    purchasesDropped,
  };
}

export function packageSeed(netBase: number, label = 'seed'): PackageSeed {
  return { formId: 'seed', label, netBase };
}

/**
 * Extract purchase events from positive delta observations.
 */
export function purchasesFromDeltas(
  events: readonly { deltaBase: number; occurredAt: string }[],
): PurchaseEvent[] {
  return events
    .filter((e) => e.deltaBase > 0)
    .map((e) => ({ qtyBase: e.deltaBase, occurredAt: e.occurredAt }));
}
