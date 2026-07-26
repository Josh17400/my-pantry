import { beforeEach,describe, expect, it } from 'vitest';

import {
  applyIncomingTxn,
  emptyProjection,
  foldLedger,
  needsRefold,
  projectionMatchesFold,
  sliceFromLastAbsolute,
  txnCursor,
} from '../../src/pantry';
import { abs, day, rel, resetSeq } from './helpers';

beforeEach(() => {
  resetSeq();
});

const META = {
  householdId: 'hh-test',
  ingredientId: 'ing-flour',
  formId: 'form-flour-allpurpose',
  dim: 'mass' as const,
};

describe('needsRefold', () => {
  it('returns true for absolute txns always', () => {
    const watermark = txnCursor(
      rel({ deltaBase: 1, occurredAt: day(5), clientTxnId: 'wm' }),
    );
    const incoming = abs({
      targetBase: 10,
      occurredAt: day(10),
      clientTxnId: 'abs-new',
    });
    expect(needsRefold(watermark, incoming)).toBe(true);
  });

  it('returns true for out-of-order relative (at or below watermark)', () => {
    const newer = rel({
      deltaBase: -10,
      reason: 'cook',
      occurredAt: day(5),
      clientTxnId: 'newer',
    });
    const watermark = txnCursor(newer);
    const older = rel({
      deltaBase: -5,
      reason: 'cook',
      occurredAt: day(2),
      clientTxnId: 'older',
    });
    expect(needsRefold(watermark, older)).toBe(true);
  });

  it('returns true when incoming equals watermark', () => {
    const t = rel({
      deltaBase: -10,
      reason: 'cook',
      occurredAt: day(5),
      clientTxnId: 'same',
    });
    expect(needsRefold(txnCursor(t), t)).toBe(true);
  });

  it('returns false for a strictly-newer relative append', () => {
    const older = rel({
      deltaBase: 100,
      occurredAt: day(1),
      clientTxnId: 'old',
    });
    const watermark = txnCursor(older);
    const newer = rel({
      deltaBase: -20,
      reason: 'cook',
      occurredAt: day(2),
      clientTxnId: 'new',
    });
    expect(needsRefold(watermark, newer)).toBe(false);
  });

  it('returns false for relative when watermark is null (empty cache path)', () => {
    const incoming = rel({
      deltaBase: 1,
      occurredAt: day(0),
      clientTxnId: 'first',
    });
    // Empty cache: safe incremental apply from 0 (not a re-fold).
    expect(needsRefold(null, incoming)).toBe(false);
  });
});

describe('applyIncomingTxn + projection invariant', () => {
  it('out-of-order insert triggers refold and matches fold(log)', () => {
    const t1 = rel({ deltaBase: 1000, occurredAt: day(0), clientTxnId: 'p' });
    const t3 = rel({
      deltaBase: -100,
      reason: 'cook',
      occurredAt: day(2),
      clientTxnId: 'c2',
    });

    let cache = emptyProjection(META);
    cache = applyIncomingTxn(cache, t1, [t1]).cache;
    cache = applyIncomingTxn(cache, t3, [t1, t3]).cache;
    expect(cache.qtyBase).toBe(900);

    const t2 = rel({
      deltaBase: -50,
      reason: 'cook',
      occurredAt: day(1),
      clientTxnId: 'c1',
    });
    expect(needsRefold(cache.watermarkCursor, t2)).toBe(true);

    const applied = applyIncomingTxn(cache, t2, [t1, t3, t2]);
    expect(applied.refolded).toBe(true);
    expect(applied.cache.qtyBase).toBe(850);
    expect(projectionMatchesFold(applied.cache, [t1, t3, t2])).toBe(true);
  });

  it('strictly-newer relative uses incremental path but still matches fold', () => {
    const t1 = rel({ deltaBase: 500, occurredAt: day(0), clientTxnId: 'p' });
    let cache = emptyProjection(META);
    cache = applyIncomingTxn(cache, t1, [t1]).cache;

    const t2 = rel({
      deltaBase: -20,
      reason: 'cook',
      occurredAt: day(1),
      clientTxnId: 'c',
    });
    expect(needsRefold(cache.watermarkCursor, t2)).toBe(false);

    const applied = applyIncomingTxn(cache, t2, [t1, t2]);
    expect(applied.refolded).toBe(false);
    expect(applied.cache.qtyBase).toBe(480);
    expect(projectionMatchesFold(applied.cache, [t1, t2])).toBe(true);
  });

  it('absolute always refolds', () => {
    const t1 = rel({ deltaBase: 500, occurredAt: day(0), clientTxnId: 'p' });
    const cache = applyIncomingTxn(emptyProjection(META), t1, [t1]).cache;
    const recount = abs({
      targetBase: 200,
      occurredAt: day(1),
      clientTxnId: 'r',
    });
    const applied = applyIncomingTxn(cache, recount, [t1, recount]);
    expect(applied.refolded).toBe(true);
    expect(applied.cache.qtyBase).toBe(200);
  });
});

describe('bounded walk-back instrumentation', () => {
  it('sliceFromLastAbsolute skips pre-checkpoint history', () => {
    const pre = Array.from({ length: 20 }, (_, i) =>
      rel({
        deltaBase: 5,
        occurredAt: day(i),
        clientTxnId: `pre-${i}`,
      }),
    );
    const cp = abs({ targetBase: 42, occurredAt: day(20), clientTxnId: 'cp' });
    const post = rel({
      deltaBase: -2,
      reason: 'cook',
      occurredAt: day(21),
      clientTxnId: 'post',
    });
    const full = [...pre, cp, post];
    const sliced = sliceFromLastAbsolute(full);

    expect(sliced.ordered.length).toBe(22);
    expect(sliced.txnsSkipped).toBe(20);
    expect(sliced.slice).toHaveLength(2);
    expect(sliced.slice.some((t) => t.clientTxnId.startsWith('pre-'))).toBe(
      false,
    );

    const fold = foldLedger(full, { bounded: true });
    expect(fold.txnsConsidered).toBe(2);
    expect(fold.qtyBase).toBe(40);
  });
});
