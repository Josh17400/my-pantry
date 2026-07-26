/**
 * Trip reconciliation — check-off + receipt against one shoppingTripId.
 *
 * Same bag of rice on both paths → one pantry commit, not a sum.
 * Pure; never writes transactions.
 *
 * Merge key: ingredientId + formId (formId defaults to '').
 * Matched qty: receipt qty preferred (purchase ground truth); if only one
 * path has quantity, use that. Never sum checkoff + receipt.
 */

import type {
  PantryCommitLine,
  ReconciledExtra,
  ReconciledMatch,
  ReconciledMissing,
  ReconcileTripInput,
  TripLine,
  TripReconciliation,
} from './types';

function lineKey(line: TripLine): string {
  return `${line.ingredientId}\x1f${line.formId ?? ''}`;
}

function aggregate(lines: readonly TripLine[]): Map<string, TripLine> {
  const map = new Map<string, TripLine>();
  for (const line of lines) {
    const k = lineKey(line);
    const prev = map.get(k);
    if (prev === undefined) {
      map.set(k, {
        ingredientId: line.ingredientId,
        formId: line.formId,
        qtyBase: line.qtyBase,
        lineId: line.lineId,
      });
    } else {
      // Same path may list an ingredient twice — sum within a single path only.
      map.set(k, {
        ...prev,
        qtyBase: prev.qtyBase + line.qtyBase,
      });
    }
  }
  return map;
}

/**
 * Reconcile manual check-offs with receipt lines for one trip.
 *
 * - **match** — key on both paths; pantry gets receipt qty (not sum)
 * - **extra** — receipt only
 * - **missing** — check-off only
 * - **pantryCommits** — single-count list for all three arrival shapes
 */
export function reconcileTrip(input: ReconcileTripInput): TripReconciliation {
  const checkMap = aggregate(input.checkedOff);
  const receiptMap = aggregate(input.receiptLines);

  const keys = new Set<string>([...checkMap.keys(), ...receiptMap.keys()]);
  const sortedKeys = [...keys].sort();

  const matches: ReconciledMatch[] = [];
  const extra: ReconciledExtra[] = [];
  const missing: ReconciledMissing[] = [];
  const pantryCommits: PantryCommitLine[] = [];

  for (const k of sortedKeys) {
    const c = checkMap.get(k);
    const r = receiptMap.get(k);

    if (c !== undefined && r !== undefined) {
      const qtyBase = r.qtyBase; // receipt preferred; never c+r
      matches.push({
        status: 'match',
        ingredientId: c.ingredientId,
        formId: c.formId ?? r.formId,
        qtyBase,
        checkoffQty: c.qtyBase,
        receiptQty: r.qtyBase,
      });
      pantryCommits.push({
        ingredientId: c.ingredientId,
        formId: c.formId ?? r.formId,
        qtyBase,
        provenance: 'reconciled',
      });
    } else if (r !== undefined) {
      extra.push({
        status: 'extra',
        ingredientId: r.ingredientId,
        formId: r.formId,
        qtyBase: r.qtyBase,
        source: 'receipt',
      });
      pantryCommits.push({
        ingredientId: r.ingredientId,
        formId: r.formId,
        qtyBase: r.qtyBase,
        provenance: 'receipt-only',
      });
    } else if (c !== undefined) {
      missing.push({
        status: 'missing',
        ingredientId: c.ingredientId,
        formId: c.formId,
        qtyBase: c.qtyBase,
        source: 'checkoff',
      });
      pantryCommits.push({
        ingredientId: c.ingredientId,
        formId: c.formId,
        qtyBase: c.qtyBase,
        provenance: 'checkoff-only',
      });
    }
  }

  return {
    shoppingTripId: input.shoppingTripId,
    matches,
    extra,
    missing,
    pantryCommits,
  };
}
