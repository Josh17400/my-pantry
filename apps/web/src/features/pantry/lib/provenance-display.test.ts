import { describe, expect, it } from 'vitest';

import {
  confidenceOf,
  formatItemQuantity,
  formatProvenanceLine,
  formatRelativeAge,
  uncertaintyForConfidence,
} from './provenance-display';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-26T12:00:00.000Z');

describe('formatRelativeAge', () => {
  it('handles never / invalid', () => {
    expect(formatRelativeAge(null, NOW)).toBe('never');
    expect(formatRelativeAge('not-a-date', NOW)).toBe('never');
  });

  it('formats days', () => {
    const twoDaysAgo = new Date(NOW - 2 * DAY).toISOString();
    expect(formatRelativeAge(twoDaysAgo, NOW)).toBe('2 days ago');
  });
});

describe('formatProvenanceLine', () => {
  it('verified → receipt · age', () => {
    const line = formatProvenanceLine(
      {
        lastVerifiedAt: new Date(NOW - 2 * DAY).toISOString(),
        unverifiedCookCount: 0,
      },
      NOW,
    );
    expect(line).toBe('✓ receipt · 2 days ago');
  });

  it('drifting cooks → cooks since verified', () => {
    const line = formatProvenanceLine(
      {
        lastVerifiedAt: new Date(NOW - DAY).toISOString(),
        unverifiedCookCount: 3,
      },
      NOW,
    );
    expect(line).toBe('⚠ 3 cooks since verified');
  });

  it('stale never verified', () => {
    const line = formatProvenanceLine(
      { lastVerifiedAt: null, unverifiedCookCount: 0 },
      NOW,
    );
    expect(line).toBe('⚠ estimated · never verified');
  });
});

describe('formatItemQuantity + uncertainty', () => {
  it('verified uses tight precision; stale widens', () => {
    const fieldsVerified = {
      lastVerifiedAt: new Date(NOW - DAY).toISOString(),
      unverifiedCookCount: 0,
    };
    const fieldsStale = {
      lastVerifiedAt: null,
      unverifiedCookCount: 0,
    };
    expect(uncertaintyForConfidence('verified')).toBe(0);
    expect(uncertaintyForConfidence('stale')).toBeGreaterThan(
      uncertaintyForConfidence('drifting'),
    );

    const v = formatItemQuantity(1134, 'mass', fieldsVerified, NOW);
    const s = formatItemQuantity(1134, 'mass', fieldsStale, NOW);
    // Human units — not raw grams forced forever
    expect(v).toMatch(/lb|oz|kg|g/);
    expect(s).toMatch(/lb|oz|kg|g/);
    expect(confidenceOf(fieldsVerified, NOW)).toBe('verified');
    expect(confidenceOf(fieldsStale, NOW)).toBe('stale');
  });
});
