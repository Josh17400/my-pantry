import { describe, expect, it, beforeEach } from 'vitest';
import {
  foldLedger,
  foldLedgerBounded,
  sliceFromLastAbsolute,
  sumRelativeDeltas,
  txnCursor,
} from '../../src/pantry';
import { abs, day, mulberry32, rel, resetSeq, shuffle } from './helpers';

beforeEach(() => {
  resetSeq();
});

describe('foldLedger — named flour regression (1000 / 500 / 800)', () => {
  it('does NOT produce 300 g; later absolute wins and conflict is reported', () => {
    const seed = rel({
      clientTxnId: 'seed-purchase',
      deltaBase: 1000,
      reason: 'purchase',
      occurredAt: day(0),
      deviceId: 'device-a',
    });

    // Concurrent offline recounts; neither observed the other (basis = seed).
    const recountA = abs({
      clientTxnId: 'recount-a',
      targetBase: 500,
      occurredAt: day(1, 10),
      deviceId: 'device-a',
      basisCursor: txnCursor(seed),
    });
    const recountB = abs({
      clientTxnId: 'recount-b',
      targetBase: 800,
      occurredAt: day(1, 11),
      deviceId: 'device-b',
      basisCursor: txnCursor(seed),
    });

    const result = foldLedger([seed, recountA, recountB]);

    expect(result.qtyBase).not.toBe(300);
    expect(result.qtyBase).toBe(800);
    expect(result.conflict).toBe(true);
    expect(result.conflictDetail?.winner.targetBase).toBe(800);
    expect(result.conflictDetail?.losers.map((l) => l.targetBase)).toEqual([
      500,
    ]);
  });

  it('device order: earlier B then later A → A wins at 500', () => {
    const seed = rel({
      clientTxnId: 'seed-purchase',
      deltaBase: 1000,
      reason: 'purchase',
      occurredAt: day(0),
    });
    const recountB = abs({
      clientTxnId: 'recount-b',
      targetBase: 800,
      occurredAt: day(1, 9),
      deviceId: 'device-b',
      basisCursor: txnCursor(seed),
    });
    const recountA = abs({
      clientTxnId: 'recount-a',
      targetBase: 500,
      occurredAt: day(1, 11),
      deviceId: 'device-a',
      basisCursor: txnCursor(seed),
    });

    const result = foldLedger([seed, recountA, recountB]);
    expect(result.qtyBase).toBe(500);
    expect(result.conflict).toBe(true);
    expect(result.conflictDetail?.winner.clientTxnId).toBe('recount-a');
  });
});

describe('foldLedger — absolute as checkpoint', () => {
  it('txns before an absolute do not affect the result', () => {
    const junk = [
      rel({ deltaBase: 9999, occurredAt: day(0), clientTxnId: 'j1' }),
      rel({ deltaBase: -4000, reason: 'cook', occurredAt: day(1), clientTxnId: 'j2' }),
      rel({ deltaBase: 50, occurredAt: day(2), clientTxnId: 'j3' }),
    ];
    const checkpoint = abs({
      targetBase: 250,
      occurredAt: day(3),
      clientTxnId: 'cp',
    });
    const after = rel({
      deltaBase: -30,
      reason: 'cook',
      occurredAt: day(4),
      clientTxnId: 'after',
    });

    const result = foldLedger([...junk, checkpoint, after]);
    expect(result.qtyBase).toBe(220);
    expect(result.lastAbsoluteCursor).toBe(txnCursor(checkpoint));
  });

  it('bounded walk-back does not read the whole log', () => {
    const early = [];
    for (let i = 0; i < 50; i++) {
      early.push(
        rel({
          deltaBase: 10,
          occurredAt: day(i),
          clientTxnId: `early-${i}`,
        }),
      );
    }
    const checkpoint = abs({
      targetBase: 100,
      occurredAt: day(50),
      clientTxnId: 'checkpoint',
    });
    const tail = [
      rel({ deltaBase: -5, reason: 'cook', occurredAt: day(51), clientTxnId: 't1' }),
      rel({ deltaBase: -5, reason: 'cook', occurredAt: day(52), clientTxnId: 't2' }),
    ];
    const full = [...early, checkpoint, ...tail];

    const sliced = sliceFromLastAbsolute(full);
    expect(sliced.ordered.length).toBe(53);
    expect(sliced.txnsSkipped).toBe(50);
    expect(sliced.txnsConsidered).toBe(3);
    expect(sliced.slice.length).toBeLessThan(full.length);

    const bounded = foldLedgerBounded(full);
    expect(bounded.qtyBase).toBe(90);
    expect(bounded.txnsConsidered).toBe(3);
    expect(bounded.txnsSkipped).toBe(50);

    const fullFold = foldLedger(full);
    expect(fullFold.qtyBase).toBe(bounded.qtyBase);
    expect(fullFold.txnsConsidered).toBe(3);
  });
});

describe('foldLedger — idempotent clientTxnId', () => {
  it('duplicate clientTxnId replay does not change the fold', () => {
    const a = rel({ deltaBase: 100, occurredAt: day(0), clientTxnId: 'same' });
    const dup = rel({ deltaBase: 100, occurredAt: day(0), clientTxnId: 'same' });
    const b = rel({
      deltaBase: -40,
      reason: 'cook',
      occurredAt: day(1),
      clientTxnId: 'cook1',
    });

    const once = foldLedger([a, b]);
    const twice = foldLedger([a, dup, b, dup]);
    expect(twice.qtyBase).toBe(once.qtyBase);
    expect(twice.qtyBase).toBe(60);
  });
});

describe('foldLedger — negative stock preserved', () => {
  it('does not clamp below zero and flags isNegative', () => {
    const result = foldLedger([
      rel({ deltaBase: 50, occurredAt: day(0), clientTxnId: 'p' }),
      rel({ deltaBase: -80, reason: 'cook', occurredAt: day(1), clientTxnId: 'c' }),
    ]);
    expect(result.qtyBase).toBe(-30);
    expect(result.isNegative).toBe(true);
  });
});

describe('foldLedger — relatives after absolute apply on top', () => {
  it('cook after recount is applied', () => {
    const result = foldLedger([
      abs({ targetBase: 500, occurredAt: day(0), clientTxnId: 'r' }),
      rel({ deltaBase: -200, reason: 'cook', occurredAt: day(1), clientTxnId: 'c' }),
    ]);
    expect(result.qtyBase).toBe(300);
    expect(result.conflict).toBe(false);
  });
});

describe('sumRelativeDeltas helper', () => {
  it('sums deltas', () => {
    const log = [
      rel({ deltaBase: 10, occurredAt: day(0), clientTxnId: 'a' }),
      rel({ deltaBase: -3, occurredAt: day(1), clientTxnId: 'b' }),
    ];
    expect(sumRelativeDeltas(log)).toBe(7);
  });
});

describe('foldLedger — arrival order independence (smoke)', () => {
  it('same result for one shuffle of mixed log', () => {
    const log = [
      rel({ deltaBase: 1000, occurredAt: day(0), clientTxnId: 'p' }),
      rel({ deltaBase: -100, reason: 'cook', occurredAt: day(1), clientTxnId: 'c1' }),
      abs({ targetBase: 400, occurredAt: day(2), clientTxnId: 'r' }),
      rel({ deltaBase: -50, reason: 'cook', occurredAt: day(3), clientTxnId: 'c2' }),
    ];
    const rand = mulberry32(42);
    const shuffled = shuffle(log, rand);
    expect(foldLedger(shuffled).qtyBase).toBe(foldLedger(log).qtyBase);
    expect(foldLedger(shuffled).qtyBase).toBe(350);
  });
});
