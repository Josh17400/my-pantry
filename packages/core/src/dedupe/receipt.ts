/**
 * Receipt fingerprint + exact / near de-dupe.
 *
 * Exact match → block. Near match within 7 days → warn.
 * Pure; never writes transactions.
 *
 * ## Near-match definition (explicit)
 *
 * A candidate is a **near** match of a prior receipt when **all** hold:
 * 1. Fingerprints differ (else exact → block).
 * 2. Normalized store strings are equal.
 * 3. Absolute calendar-day difference ≤ `nearWindowDays` (default **7**).
 *    Boundary: dayDiff === 7 is near; dayDiff === 8 is not.
 * 4. Totals and line counts are "close":
 *    - same total (cent-rounded) AND |lineCountDiff| ≤ `nearLineCountSlop` (default 1), OR
 *    - same lineCount AND |totalDiffCents| ≤ `nearTotalCents` (default 100 = $1.00)
 *
 * Distinct store, dayDiff > 7, or totals/lines outside the slop → ok.
 */

import type {
  CheckReceiptOptions,
  ReceiptDedupeDecision,
  ReceiptFingerprintInput,
  ReceiptRecord,
} from './types';

export const DEFAULT_NEAR_WINDOW_DAYS = 7;
export const DEFAULT_NEAR_TOTAL_CENTS = 100;
export const DEFAULT_NEAR_LINE_SLOP = 1;

/** Normalize store for fingerprint: lowercase, collapse whitespace/punct. */
export function normalizeStore(store: string): string {
  return store
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize to YYYY-MM-DD. Accepts full ISO timestamps (uses UTC date).
 */
export function normalizeReceiptDate(date: string): string {
  const trimmed = date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const t = Date.parse(trimmed);
  if (Number.isNaN(t)) {
    throw new Error(`Invalid receipt date: ${date}`);
  }
  return new Date(t).toISOString().slice(0, 10);
}

/** Round money to integer cents (half-away-from-zero via round). */
export function toCents(total: number): number {
  return Math.round(total * 100);
}

/**
 * FNV-1a 32-bit hex of the canonical payload.
 * Deterministic across runs; not cryptographic.
 */
export function fnv1aHex(payload: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // unsigned
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Fingerprint: hash(normalizedStore, YYYY-MM-DD, totalCents, lineCount).
 */
export function receiptFingerprint(input: ReceiptFingerprintInput): string {
  const store = normalizeStore(input.store);
  const date = normalizeReceiptDate(input.date);
  const cents = toCents(input.total);
  const payload = `${store}\x1f${date}\x1f${cents}\x1f${input.lineCount}`;
  return fnv1aHex(payload);
}

function dayDiffAbs(a: string, b: string): number {
  const da = normalizeReceiptDate(a);
  const db = normalizeReceiptDate(b);
  const ms =
    Date.parse(`${da}T00:00:00.000Z`) - Date.parse(`${db}T00:00:00.000Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

function isNear(
  candidate: ReceiptFingerprintInput,
  prior: ReceiptRecord,
  options: Required<
    Pick<
      CheckReceiptOptions,
      'nearWindowDays' | 'nearTotalCents' | 'nearLineCountSlop'
    >
  >,
): { near: true; dayDiff: number; totalDiffCents: number; lineCountDiff: number } | { near: false } {
  if (normalizeStore(candidate.store) !== normalizeStore(prior.store)) {
    return { near: false };
  }
  const dayDiff = dayDiffAbs(candidate.date, prior.date);
  if (dayDiff > options.nearWindowDays) {
    return { near: false };
  }

  const totalDiffCents = Math.abs(toCents(candidate.total) - toCents(prior.total));
  const lineCountDiff = Math.abs(candidate.lineCount - prior.lineCount);

  const totalsEqual = totalDiffCents === 0;
  const linesEqual = lineCountDiff === 0;

  const close =
    (totalsEqual && lineCountDiff <= options.nearLineCountSlop) ||
    (linesEqual && totalDiffCents <= options.nearTotalCents);

  if (!close) return { near: false };

  return { near: true, dayDiff, totalDiffCents, lineCountDiff };
}

/**
 * Check candidate receipt against prior household receipt records.
 * Exact fingerprint → block. Near → warn (first near prior by dayDiff, then fingerprint).
 * Else ok.
 */
export function checkReceiptDuplicate(
  candidate: ReceiptFingerprintInput,
  priors: readonly ReceiptRecord[],
  options: CheckReceiptOptions = {},
): ReceiptDedupeDecision {
  const nearWindowDays = options.nearWindowDays ?? DEFAULT_NEAR_WINDOW_DAYS;
  const nearTotalCents = options.nearTotalCents ?? DEFAULT_NEAR_TOTAL_CENTS;
  const nearLineCountSlop =
    options.nearLineCountSlop ?? DEFAULT_NEAR_LINE_SLOP;

  const fp = receiptFingerprint(candidate);

  for (const prior of priors) {
    if (prior.fingerprint === fp) {
      return { kind: 'block', reason: 'exact-match', prior };
    }
  }

  let bestNear: {
    prior: ReceiptRecord;
    dayDiff: number;
    totalDiffCents: number;
    lineCountDiff: number;
  } | null = null;

  for (const prior of priors) {
    const n = isNear(candidate, prior, {
      nearWindowDays,
      nearTotalCents,
      nearLineCountSlop,
    });
    if (!n.near) continue;
    if (
      bestNear === null ||
      n.dayDiff < bestNear.dayDiff ||
      (n.dayDiff === bestNear.dayDiff &&
        prior.fingerprint < bestNear.prior.fingerprint)
    ) {
      bestNear = {
        prior,
        dayDiff: n.dayDiff,
        totalDiffCents: n.totalDiffCents,
        lineCountDiff: n.lineCountDiff,
      };
    }
  }

  if (bestNear !== null) {
    return {
      kind: 'warn',
      reason: 'near-match',
      prior: bestNear.prior,
      dayDiff: bestNear.dayDiff,
      totalDiffCents: bestNear.totalDiffCents,
      lineCountDiff: bestNear.lineCountDiff,
    };
  }

  return { kind: 'ok' };
}

/** Build a prior record from fingerprint inputs (helper for callers/tests). */
export function toReceiptRecord(
  input: ReceiptFingerprintInput,
): ReceiptRecord {
  return {
    ...input,
    date: normalizeReceiptDate(input.date),
    fingerprint: receiptFingerprint(input),
  };
}
