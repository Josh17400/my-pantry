/**
 * Home display + greeting unit tests (no DOM).
 */

import { describe, expect, it } from 'vitest';

import { computeCookNow, formatUseUpLine, pantryItemsToStockRows } from './cookable';
import { loadDemoHomeData } from './demo-data';
import {
  formatProvenanceLabel,
  formatQuantityWithProvenance,
  locationStatusWord,
  toItemDisplay,
} from './display';
import {
  displayNameFromUser,
  fullGreeting,
  greetingPeriod,
} from './greeting';

describe('greeting', () => {
  it('returns morning before noon with a name', () => {
    const d = new Date('2026-07-26T09:00:00');
    expect(greetingPeriod(d)).toBe('morning');
    expect(fullGreeting('Sam', d)).toBe('Good morning, Sam');
  });

  it('returns afternoon midday', () => {
    const d = new Date('2026-07-26T14:00:00');
    expect(greetingPeriod(d)).toBe('afternoon');
  });

  it('omits the name when none is provided', () => {
    const d = new Date('2026-07-26T14:00:00');
    expect(fullGreeting(null, d)).toBe('Good afternoon');
    expect(fullGreeting(undefined, d)).toBe('Good afternoon');
    expect(fullGreeting('  ', d)).toBe('Good afternoon');
  });

  it('never invents a default name', () => {
    const d = new Date('2026-07-26T09:00:00');
    expect(fullGreeting(null, d)).not.toMatch(/Alex/i);
    expect(fullGreeting(null, d)).toBe('Good morning');
  });

  it('derives a display name from email local-part', () => {
    expect(displayNameFromUser({ email: 'jane.doe@example.com' })).toBe('Jane');
    expect(
      displayNameFromUser({ email: 'x@y.com', displayName: 'Alexandra' }),
    ).toBe('Alexandra');
    expect(displayNameFromUser(null)).toBeNull();
  });
});

describe('provenance display', () => {
  const now = Date.parse('2026-07-26T12:00:00Z');

  it('marks verified quantities without estimate markers', () => {
    const q = formatQuantityWithProvenance(500, 'mass', 'verified');
    // metric auto-unit may render 500g as 0.5kg
    expect(q).toMatch(/0\.5kg|500g/);
    expect(q).not.toContain('~');
    expect(q).not.toContain('⚠');
  });

  it('marks drifting quantities with warning', () => {
    const q = formatQuantityWithProvenance(500, 'mass', 'drifting');
    expect(q).toContain('⚠');
  });

  it('marks stale quantities with tilde estimate', () => {
    const q = formatQuantityWithProvenance(412, 'volume', 'stale');
    expect(q.startsWith('~')).toBe(true);
  });

  it('formats provenance labels per SPEC bands', () => {
    expect(
      formatProvenanceLabel(null, 0, 'stale', now),
    ).toMatch(/never verified/);

    expect(
      formatProvenanceLabel(
        new Date(now - 2 * 86400000).toISOString(),
        3,
        'drifting',
        now,
      ),
    ).toMatch(/3 cooks/);

    expect(
      formatProvenanceLabel(
        new Date(now - 2 * 86400000).toISOString(),
        0,
        'verified',
        now,
      ),
    ).toMatch(/receipt/);
  });
});

describe('item display', () => {
  it('surfaces expiry as critical when ≤2 days', () => {
    const now = Date.parse('2026-07-26T12:00:00Z');
    const d = toItemDisplay(
      {
        qtyBase: 100,
        dim: 'mass',
        parLevelBase: 280,
        lowThresholdPct: 0.25,
        lastVerifiedAt: new Date(now).toISOString(),
        unverifiedCookCount: 0,
        expiresAt: new Date(now + 1 * 86400000).toISOString(),
      },
      now,
    );
    expect(d.status).toBe('critical');
    expect(d.statusLabel).toMatch(/1 day|Today/);
  });

  it('shows Almost empty for very low stock', () => {
    const now = Date.now();
    const d = toItemDisplay(
      {
        qtyBase: 50,
        dim: 'volume',
        parLevelBase: 1000,
        lowThresholdPct: 0.25,
        lastVerifiedAt: new Date(now).toISOString(),
        unverifiedCookCount: 0,
        expiresAt: null,
      },
      now,
    );
    expect(d.status).toBe('low');
    expect(d.statusLabel).toMatch(/Almost empty|Getting low/);
  });
});

describe('location status word', () => {
  it('returns Empty for no items', () => {
    expect(locationStatusWord([]).word).toBe('Empty');
  });

  it('returns Well stocked when healthy', () => {
    const r = locationStatusWord([
      {
        qtyBase: 1000,
        parLevelBase: 1000,
        lowThresholdPct: 0.25,
        expiresAt: null,
      },
    ]);
    expect(r.status).toBe('fresh');
  });
});

describe('cook-now with demo fixtures', () => {
  it('finds fully cookable recipes from fixture pantry', () => {
    const demo = loadDemoHomeData();
    const result = computeCookNow(
      demo.recipes,
      pantryItemsToStockRows(demo.items),
      { now: new Date().toISOString() },
    );
    expect(result.fullyCookableCount).toBeGreaterThan(0);
    expect(result.inspiration.length).toBeGreaterThan(0);
  });

  it('formats use-up lines for expiring ingredients', () => {
    const demo = loadDemoHomeData();
    const result = computeCookNow(
      demo.recipes,
      pantryItemsToStockRows(demo.items),
      { now: new Date().toISOString() },
    );
    const withUseUp = result.inspiration.find((m) => m.useUpCount > 0);
    // Spinach expires in 1 day in fixtures — spinach scramble should use it up
    if (withUseUp) {
      const line = formatUseUpLine(withUseUp);
      expect(line).toMatch(/^Use up:/);
    }
  });
});
