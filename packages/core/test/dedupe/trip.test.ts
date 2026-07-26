import { describe, expect, it } from 'vitest';

import { reconcileTrip } from '../../src/dedupe';

describe('reconcileTrip', () => {
  it('match: same ingredient on checkoff + receipt lands once (receipt qty)', () => {
    const r = reconcileTrip({
      shoppingTripId: 'trip-1',
      checkedOff: [
        { ingredientId: 'rice', formId: 'rice-bag', qtyBase: 2000 },
      ],
      receiptLines: [
        { ingredientId: 'rice', formId: 'rice-bag', qtyBase: 2268 },
      ],
    });
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.qtyBase).toBe(2268); // receipt preferred, not sum
    expect(r.matches[0]!.checkoffQty).toBe(2000);
    expect(r.matches[0]!.receiptQty).toBe(2268);
    expect(r.extra).toHaveLength(0);
    expect(r.missing).toHaveLength(0);
    expect(r.pantryCommits).toHaveLength(1);
    expect(r.pantryCommits[0]).toEqual({
      ingredientId: 'rice',
      formId: 'rice-bag',
      qtyBase: 2268,
      provenance: 'reconciled',
    });
    // Never sum
    expect(r.pantryCommits[0]!.qtyBase).not.toBe(2000 + 2268);
  });

  it('extra: receipt-only items', () => {
    const r = reconcileTrip({
      shoppingTripId: 'trip-2',
      checkedOff: [{ ingredientId: 'milk', qtyBase: 1000 }],
      receiptLines: [
        { ingredientId: 'milk', qtyBase: 1000 },
        { ingredientId: 'cookies', qtyBase: 300 },
      ],
    });
    expect(r.matches).toHaveLength(1);
    expect(r.extra).toHaveLength(1);
    expect(r.extra[0]!.ingredientId).toBe('cookies');
    expect(r.extra[0]!.source).toBe('receipt');
    expect(
      r.pantryCommits.find((c) => c.ingredientId === 'cookies')?.provenance,
    ).toBe('receipt-only');
  });

  it('missing: checkoff-only items', () => {
    const r = reconcileTrip({
      shoppingTripId: 'trip-3',
      checkedOff: [
        { ingredientId: 'eggs', qtyBase: 12 },
        { ingredientId: 'butter', qtyBase: 454 },
      ],
      receiptLines: [{ ingredientId: 'eggs', qtyBase: 12 }],
    });
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0]!.ingredientId).toBe('butter');
    expect(r.missing[0]!.source).toBe('checkoff');
    expect(
      r.pantryCommits.find((c) => c.ingredientId === 'butter')?.provenance,
    ).toBe('checkoff-only');
  });

  it('all three arrival paths produce single-count pantry commits', () => {
    // Path A: checkoff only, B: both, C: receipt only
    const r = reconcileTrip({
      shoppingTripId: 'trip-4',
      checkedOff: [
        { ingredientId: 'a-checkoff', qtyBase: 1 },
        { ingredientId: 'b-both', qtyBase: 2 },
      ],
      receiptLines: [
        { ingredientId: 'b-both', qtyBase: 3 },
        { ingredientId: 'c-receipt', qtyBase: 4 },
      ],
    });

    expect(r.matches.map((m) => m.ingredientId)).toEqual(['b-both']);
    expect(r.extra.map((e) => e.ingredientId)).toEqual(['c-receipt']);
    expect(r.missing.map((m) => m.ingredientId)).toEqual(['a-checkoff']);

    // Exactly one commit per ingredient — rice/bag double-path rule generalized
    const ids = r.pantryCommits.map((c) => c.ingredientId).sort();
    expect(ids).toEqual(['a-checkoff', 'b-both', 'c-receipt']);
    expect(r.pantryCommits).toHaveLength(3);

    const both = r.pantryCommits.find((c) => c.ingredientId === 'b-both')!;
    expect(both.qtyBase).toBe(3); // not 5
    expect(both.provenance).toBe('reconciled');
  });

  it('aggregates duplicate lines within a single path before reconcile', () => {
    const r = reconcileTrip({
      shoppingTripId: 'trip-5',
      checkedOff: [
        { ingredientId: 'tomato', qtyBase: 200 },
        { ingredientId: 'tomato', qtyBase: 300 },
      ],
      receiptLines: [{ ingredientId: 'tomato', qtyBase: 500 }],
    });
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.checkoffQty).toBe(500);
    expect(r.matches[0]!.qtyBase).toBe(500);
    expect(r.pantryCommits).toHaveLength(1);
  });

  it('formId participates in the merge key', () => {
    const r = reconcileTrip({
      shoppingTripId: 'trip-6',
      checkedOff: [
        { ingredientId: 'garlic', formId: 'clove', qtyBase: 30 },
      ],
      receiptLines: [
        { ingredientId: 'garlic', formId: 'minced', qtyBase: 100 },
      ],
    });
    // Different forms → not the same key → missing + extra
    expect(r.matches).toHaveLength(0);
    expect(r.missing).toHaveLength(1);
    expect(r.extra).toHaveLength(1);
    expect(r.pantryCommits).toHaveLength(2);
  });
});
