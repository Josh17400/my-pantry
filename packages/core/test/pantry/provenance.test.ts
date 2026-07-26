import { beforeEach,describe, expect, it } from 'vitest';

import {
  confidenceFrom,
  DRIFTING_MAX_COOKS,
  foldLedger,
  foldProvenance,
  STALE_AGE_MS,
  VERIFIED_MAX_AGE_MS,
} from '../../src/pantry';
import { abs, day, rel, resetSeq } from './helpers';

beforeEach(() => {
  resetSeq();
});

describe('provenance', () => {
  it('increments unverified cook count on cooks', () => {
    const log = [
      rel({
        deltaBase: 500,
        reason: 'purchase',
        occurredAt: day(0),
        clientTxnId: 'p',
      }),
      rel({
        deltaBase: -50,
        reason: 'cook',
        occurredAt: day(1),
        clientTxnId: 'c1',
      }),
      rel({
        deltaBase: -50,
        reason: 'cook',
        occurredAt: day(2),
        clientTxnId: 'c2',
      }),
      rel({
        deltaBase: -50,
        reason: 'cook',
        occurredAt: day(3),
        clientTxnId: 'c3',
      }),
    ];
    const p = foldProvenance(log, day(3));
    expect(p.lastVerifiedAt).toBe(day(0));
    expect(p.unverifiedCookCount).toBe(3);
    expect(p.confidence).toBe('drifting');
  });

  it('resets cook count on purchase', () => {
    const log = [
      rel({
        deltaBase: 500,
        reason: 'purchase',
        occurredAt: day(0),
        clientTxnId: 'p1',
      }),
      rel({
        deltaBase: -50,
        reason: 'cook',
        occurredAt: day(1),
        clientTxnId: 'c1',
      }),
      rel({
        deltaBase: 200,
        reason: 'purchase',
        occurredAt: day(2),
        clientTxnId: 'p2',
      }),
      rel({
        deltaBase: -20,
        reason: 'cook',
        occurredAt: day(3),
        clientTxnId: 'c2',
      }),
    ];
    const p = foldProvenance(log, day(3));
    expect(p.lastVerifiedAt).toBe(day(2));
    expect(p.unverifiedCookCount).toBe(1);
  });

  it('resets cook count on recount', () => {
    const log = [
      rel({
        deltaBase: 500,
        reason: 'purchase',
        occurredAt: day(0),
        clientTxnId: 'p',
      }),
      rel({
        deltaBase: -50,
        reason: 'cook',
        occurredAt: day(1),
        clientTxnId: 'c1',
      }),
      rel({
        deltaBase: -50,
        reason: 'cook',
        occurredAt: day(2),
        clientTxnId: 'c2',
      }),
      abs({ targetBase: 400, occurredAt: day(3), clientTxnId: 'r' }),
    ];
    const p = foldProvenance(log, day(3));
    expect(p.lastVerifiedAt).toBe(day(3));
    expect(p.unverifiedCookCount).toBe(0);
    expect(p.confidence).toBe('verified');
  });

  it('waste counts as consumption; adjust_delta does not', () => {
    const log = [
      rel({
        deltaBase: 100,
        reason: 'purchase',
        occurredAt: day(0),
        clientTxnId: 'p',
      }),
      rel({
        deltaBase: -10,
        reason: 'waste',
        occurredAt: day(1),
        clientTxnId: 'w',
      }),
      rel({
        deltaBase: -5,
        reason: 'adjust_delta',
        occurredAt: day(2),
        clientTxnId: 'a',
      }),
    ];
    const p = foldProvenance(log, day(2));
    expect(p.unverifiedCookCount).toBe(1);
  });

  it('never verified → stale', () => {
    const log = [
      rel({
        deltaBase: -10,
        reason: 'cook',
        occurredAt: day(0),
        clientTxnId: 'c',
      }),
    ];
    expect(foldProvenance(log, day(0)).confidence).toBe('stale');
    expect(confidenceFrom(null, 0, day(0))).toBe('stale');
  });

  it('cook count above DRIFTING_MAX_COOKS → stale', () => {
    const cooks = [];
    for (let i = 1; i <= DRIFTING_MAX_COOKS + 1; i++) {
      cooks.push(
        rel({
          deltaBase: -10,
          reason: 'cook',
          occurredAt: day(i),
          clientTxnId: `c${i}`,
        }),
      );
    }
    const log = [
      rel({
        deltaBase: 500,
        reason: 'purchase',
        occurredAt: day(0),
        clientTxnId: 'p',
      }),
      ...cooks,
    ];
    const p = foldProvenance(log, day(DRIFTING_MAX_COOKS + 1));
    expect(p.unverifiedCookCount).toBe(DRIFTING_MAX_COOKS + 1);
    expect(p.confidence).toBe('stale');
  });

  it('age bands: verified → drifting → stale by time alone', () => {
    const verifiedAt = day(0);
    const t0 = Date.parse(verifiedAt);

    const withinVerified = new Date(t0 + VERIFIED_MAX_AGE_MS - 1000).toISOString();
    expect(confidenceFrom(verifiedAt, 0, withinVerified)).toBe('verified');

    const mid = new Date(t0 + VERIFIED_MAX_AGE_MS + 1000).toISOString();
    expect(confidenceFrom(verifiedAt, 0, mid)).toBe('drifting');

    const old = new Date(t0 + STALE_AGE_MS + 1000).toISOString();
    expect(confidenceFrom(verifiedAt, 0, old)).toBe('stale');
  });

  it('foldLedger embeds provenance', () => {
    const result = foldLedger(
      [
        rel({
          deltaBase: 100,
          reason: 'purchase',
          occurredAt: day(0),
          clientTxnId: 'p',
        }),
        rel({
          deltaBase: -10,
          reason: 'cook',
          occurredAt: day(1),
          clientTxnId: 'c',
        }),
      ],
      { nowIso: day(1) },
    );
    expect(result.provenance.unverifiedCookCount).toBe(1);
    expect(result.provenance.confidence).toBe('drifting');
  });
});
