import { describe, expect, it, beforeEach } from 'vitest';
import {
  applyIncomingTxn,
  emptyProjection,
  foldLedger,
  sumRelativeDeltas,
} from '../../src/pantry';
import {
  abs,
  day,
  mulberry32,
  rel,
  resetSeq,
  shuffle,
} from './helpers';

beforeEach(() => {
  resetSeq();
});

const META = {
  householdId: 'hh-test',
  ingredientId: 'ing-flour',
  formId: 'form-flour-allpurpose',
  dim: 'mass' as const,
};

describe('property: relative-only fold equals sum of deltas under shuffle', () => {
  it('holds for arbitrary relative logs and shuffles (seeded)', () => {
    const seed = 0xc0ffee;
    const rand = mulberry32(seed);
    const TRIALS = 40;

    for (let trial = 0; trial < TRIALS; trial++) {
      const n = 3 + Math.floor(rand() * 12);
      const log = [];
      for (let i = 0; i < n; i++) {
        const delta = Math.floor(rand() * 401) - 150;
        log.push(
          rel({
            deltaBase: delta,
            reason: delta >= 0 ? 'purchase' : 'cook',
            occurredAt: day(i, Math.floor(rand() * 24)),
            deviceId: rand() < 0.5 ? 'device-a' : 'device-b',
            clientTxnId: `t${trial}-${i}`,
          }),
        );
      }

      const expected = sumRelativeDeltas(log);
      for (let s = 0; s < 25; s++) {
        const shuffled = shuffle(log, rand);
        expect(foldLedger(shuffled).qtyBase).toBe(expected);
      }
    }
  });
});

describe('property: fold invariant under arbitrary arrival-order permutation', () => {
  it('mixed relative + absolute logs yield one identical result every shuffle', () => {
    const seed = 0xdeadbeef;
    const rand = mulberry32(seed);
    const TRIALS = 30;

    for (let trial = 0; trial < TRIALS; trial++) {
      const log = [];
      let t = 0;
      log.push(
        rel({
          deltaBase: 500 + Math.floor(rand() * 500),
          occurredAt: day(t++),
          clientTxnId: `p-${trial}`,
          deviceId: 'device-a',
        }),
      );
      const cooks = 2 + Math.floor(rand() * 5);
      for (let i = 0; i < cooks; i++) {
        log.push(
          rel({
            deltaBase: -(10 + Math.floor(rand() * 40)),
            reason: 'cook',
            occurredAt: day(t++),
            clientTxnId: `c-${trial}-${i}`,
            deviceId: rand() < 0.5 ? 'device-a' : 'device-b',
          }),
        );
      }
      log.push(
        abs({
          targetBase: 100 + Math.floor(rand() * 400),
          occurredAt: day(t++),
          clientTxnId: `r-${trial}`,
          deviceId: rand() < 0.5 ? 'device-a' : 'device-c',
        }),
      );
      log.push(
        rel({
          deltaBase: -(5 + Math.floor(rand() * 30)),
          reason: 'cook',
          occurredAt: day(t++),
          clientTxnId: `after-${trial}`,
          deviceId: 'device-b',
        }),
      );

      const baseline = foldLedger(log);
      for (let s = 0; s < 30; s++) {
        const shuffled = shuffle(log, rand);
        const result = foldLedger(shuffled);
        expect(result.qtyBase).toBe(baseline.qtyBase);
        expect(result.conflict).toBe(baseline.conflict);
        expect(result.lastTxnCursor).toBe(baseline.lastTxnCursor);
        expect(result.lastAbsoluteCursor).toBe(baseline.lastAbsoluteCursor);
        expect(result.isNegative).toBe(baseline.isNegative);
      }
    }
  });
});

describe('property: projection == fold after merge sequences', () => {
  it('incremental apply vs re-fold stay equal under random arrival', () => {
    const seed = 0x12345678;
    const rand = mulberry32(seed);

    for (let trial = 0; trial < 20; trial++) {
      const events = [];
      let t = 0;
      events.push(
        rel({
          deltaBase: 1000,
          occurredAt: day(t++),
          clientTxnId: `base-${trial}`,
          deviceId: 'd0',
        }),
      );
      for (let i = 0; i < 8; i++) {
        if (rand() < 0.15) {
          events.push(
            abs({
              targetBase: Math.floor(rand() * 800),
              occurredAt: day(t++),
              clientTxnId: `abs-${trial}-${i}`,
              deviceId: `d${Math.floor(rand() * 3)}`,
            }),
          );
        } else {
          const d = Math.floor(rand() * 200) - 80;
          events.push(
            rel({
              deltaBase: d,
              reason: d >= 0 ? 'purchase' : 'cook',
              occurredAt: day(t++),
              clientTxnId: `rel-${trial}-${i}`,
              deviceId: `d${Math.floor(rand() * 3)}`,
            }),
          );
        }
      }

      const arrival = shuffle(events, rand);
      const log: typeof events = [];
      let cache = emptyProjection(META);

      for (const incoming of arrival) {
        log.push(incoming);
        const applied = applyIncomingTxn(cache, incoming, log);
        cache = applied.cache;
        expect(cache.qtyBase).toBe(foldLedger(log).qtyBase);
      }
    }
  });
});
