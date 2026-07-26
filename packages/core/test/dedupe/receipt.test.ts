import { describe, expect, it } from 'vitest';
import {
  checkReceiptDuplicate,
  DEFAULT_NEAR_WINDOW_DAYS,
  receiptFingerprint,
  toReceiptRecord,
} from '../../src/dedupe';

const base = {
  store: 'Costco #123',
  date: '2026-07-20',
  total: 142.57,
  lineCount: 28,
};

describe('receiptFingerprint', () => {
  it('is deterministic', () => {
    expect(receiptFingerprint(base)).toBe(receiptFingerprint({ ...base }));
  });

  it('normalizes store case/punct', () => {
    const a = receiptFingerprint(base);
    const b = receiptFingerprint({
      ...base,
      store: 'costco 123',
    });
    // 'Costco #123' → 'costco 123' after strip #
    expect(a).toBe(b);
  });

  it('differs when total or lines change', () => {
    const a = receiptFingerprint(base);
    expect(
      receiptFingerprint({ ...base, total: 142.58 }),
    ).not.toBe(a);
    expect(
      receiptFingerprint({ ...base, lineCount: 29 }),
    ).not.toBe(a);
  });

  it('uses calendar date from ISO timestamps', () => {
    const a = receiptFingerprint({
      ...base,
      date: '2026-07-20T23:00:00.000Z',
    });
    const b = receiptFingerprint({ ...base, date: '2026-07-20' });
    expect(a).toBe(b);
  });
});

describe('checkReceiptDuplicate', () => {
  const prior = toReceiptRecord(base);

  it('exact match blocks', () => {
    const d = checkReceiptDuplicate(base, [prior]);
    expect(d.kind).toBe('block');
    if (d.kind === 'block') {
      expect(d.reason).toBe('exact-match');
      expect(d.prior.fingerprint).toBe(prior.fingerprint);
    }
  });

  it('near: same store, dayDiff ≤ 7, same total, lineCount ±1 → warn', () => {
    const candidate = {
      store: 'Costco #123',
      date: '2026-07-27', // +7 days
      total: 142.57,
      lineCount: 29,
    };
    const d = checkReceiptDuplicate(candidate, [prior]);
    expect(d.kind).toBe('warn');
    if (d.kind === 'warn') {
      expect(d.dayDiff).toBe(7);
      expect(d.lineCountDiff).toBe(1);
    }
  });

  it('boundary: dayDiff === 7 is near; dayDiff === 8 is ok', () => {
    const day7 = checkReceiptDuplicate(
      { ...base, date: '2026-07-27', lineCount: 28 },
      [prior],
    );
    // same total+lines+store on different day → different fingerprint, near by total+lines
    expect(day7.kind).toBe('warn');
    if (day7.kind === 'warn') expect(day7.dayDiff).toBe(7);

    const day8 = checkReceiptDuplicate(
      { ...base, date: '2026-07-28', lineCount: 28 },
      [prior],
    );
    expect(day8.kind).toBe('ok');
  });

  it('near: same lineCount, total within $1 → warn', () => {
    const d = checkReceiptDuplicate(
      { ...base, date: '2026-07-21', total: 143.07 }, // +50 cents
      [prior],
    );
    expect(d.kind).toBe('warn');
    if (d.kind === 'warn') {
      expect(d.totalDiffCents).toBe(50);
      expect(d.lineCountDiff).toBe(0);
    }
  });

  it('boundary: total diff $1.00 is near; $1.01 is ok (same lines)', () => {
    const dollar = checkReceiptDuplicate(
      { ...base, date: '2026-07-21', total: 143.57 },
      [prior],
    );
    expect(dollar.kind).toBe('warn');

    const over = checkReceiptDuplicate(
      { ...base, date: '2026-07-21', total: 143.58 },
      [prior],
    );
    expect(over.kind).toBe('ok');
  });

  it('different store is not near even if totals match', () => {
    const d = checkReceiptDuplicate(
      { ...base, store: 'Walmart', date: '2026-07-21' },
      [prior],
    );
    expect(d.kind).toBe('ok');
  });

  it('distinct receipt is ok', () => {
    const d = checkReceiptDuplicate(
      {
        store: 'Trader Joes',
        date: '2026-07-25',
        total: 48.12,
        lineCount: 12,
      },
      [prior],
    );
    expect(d.kind).toBe('ok');
  });

  it('respects custom nearWindowDays', () => {
    const d = checkReceiptDuplicate(
      { ...base, date: '2026-07-23', lineCount: 28 },
      [prior],
      { nearWindowDays: 2 },
    );
    // dayDiff=3 > 2
    expect(d.kind).toBe('ok');
  });

  it('DEFAULT_NEAR_WINDOW_DAYS is 7', () => {
    expect(DEFAULT_NEAR_WINDOW_DAYS).toBe(7);
  });
});
