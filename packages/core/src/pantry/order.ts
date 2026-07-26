import type { PantryTxn } from './types';

/**
 * Total order on pantry transactions for a household ingredient.
 *
 * Order key: (occurredAt, deviceId, clientTxnId) — lexicographic on each field.
 *
 * Why this is total (no ties for distinct logical events):
 * - `clientTxnId` is unique per household (DB: UNIQUE(household_id, client_txn_id)).
 * - Therefore any two distinct accepted events differ in at least clientTxnId.
 * - When all three fields compare equal, the events are the same logical write
 *   (idempotent replay) and de-dupe collapses them before fold.
 *
 * occurredAt is client clock (ISO-8601). Device clock skew can mis-order events
 * relative to wall time; acceptedAt is recorded for diagnostics / future LWW
 * experiments but is NOT part of the fold order (spec: fold uses occurredAt triple).
 *
 * Cursor encoding uses U+001F (unit separator) so field boundaries cannot be
 * forged by embedding separators in UUIDs/ISO strings.
 */

const SEP = '\x1f';

export function txnCursor(
  txn: Pick<PantryTxn, 'occurredAt' | 'deviceId' | 'clientTxnId'>,
): string {
  return `${txn.occurredAt}${SEP}${txn.deviceId}${SEP}${txn.clientTxnId}`;
}

/** Compare two total-order cursors. Negative if a < b, 0 if equal, positive if a > b. */
export function compareCursors(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Compare two txns by the total-order triple. */
export function compareTxnOrder(a: PantryTxn, b: PantryTxn): number {
  if (a.occurredAt !== b.occurredAt) {
    return a.occurredAt < b.occurredAt ? -1 : 1;
  }
  if (a.deviceId !== b.deviceId) {
    return a.deviceId < b.deviceId ? -1 : 1;
  }
  if (a.clientTxnId !== b.clientTxnId) {
    return a.clientTxnId < b.clientTxnId ? -1 : 1;
  }
  return 0;
}

/** Alias. */
export const compareTxns = compareTxnOrder;

/**
 * Sort ascending by total order. Does not de-dupe.
 */
export function sortTxns(txns: readonly PantryTxn[]): PantryTxn[] {
  return [...txns].sort(compareTxnOrder);
}

/**
 * De-duplicate by clientTxnId (first occurrence in input order wins).
 * Prefer prepareLog which sorts then de-dupes for deterministic first-in-order.
 */
export function dedupeByClientTxnId(txns: readonly PantryTxn[]): PantryTxn[] {
  const seen = new Set<string>();
  const out: PantryTxn[] = [];
  for (const t of txns) {
    if (seen.has(t.clientTxnId)) continue;
    seen.add(t.clientTxnId);
    out.push(t);
  }
  return out;
}

/**
 * Prepare a log for folding: total-order sort, then de-dupe by clientTxnId
 * (earliest in total order wins for a given clientTxnId).
 */
export function prepareLog(txns: readonly PantryTxn[]): PantryTxn[] {
  return dedupeByClientTxnId(sortTxns(txns));
}

/** Detailed prepare (duplicate count for diagnostics). */
export function prepareLogDetailed(txns: readonly PantryTxn[]): {
  ordered: PantryTxn[];
  dedupedCount: number;
} {
  const ordered = prepareLog(txns);
  return { ordered, dedupedCount: txns.length - ordered.length };
}

/** @deprecated alias */
export function sortAndDedupe(txns: readonly PantryTxn[]): {
  sorted: PantryTxn[];
  dedupedCount: number;
} {
  const { ordered, dedupedCount } = prepareLogDetailed(txns);
  return { sorted: ordered, dedupedCount };
}
