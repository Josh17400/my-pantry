import { describe, expect, it } from 'vitest';

import {
  createPromotionCandidate,
  evaluatePromotion,
  MIN_HOUSEHOLDS_FOR_PROMOTION,
  shouldAutoPromote,
} from '../../src/matching';

describe('promotion candidates never auto-applied', () => {
  it('createPromotionCandidate always has autoApplied: false', () => {
    const c = createPromotionCandidate({
      alias: 'HVY CRM',
      ingredientId: 'heavy-cream',
      householdId: 'hh-1',
      now: () => new Date('2026-07-25T12:00:00.000Z'),
    });
    expect(c.autoApplied).toBe(false);
    expect(c.alias).toBe('HVY CRM');
    expect(c.observedAt).toBe('2026-07-25T12:00:00.000Z');
  });

  it('shouldAutoPromote always returns false', () => {
    const c = createPromotionCandidate({
      alias: 'x',
      ingredientId: 'y',
      householdId: 'z',
    });
    expect(shouldAutoPromote(c)).toBe(false);
  });

  it('majority households alone does not promote without curation', () => {
    const d = evaluatePromotion({
      independentHouseholdCount: MIN_HOUSEHOLDS_FOR_PROMOTION + 10,
      curated: false,
      disagreementRate: 0,
    });
    expect(d.action).not.toBe('promote');
    expect(d.action).toBe('queue');
    if (d.action === 'queue') {
      expect(d.needsCuration).toBe(true);
    }
  });

  it('curation alone does not promote without enough households', () => {
    const d = evaluatePromotion({
      independentHouseholdCount: 2,
      curated: true,
      disagreementRate: 0,
    });
    expect(d.action).toBe('queue');
    if (d.action === 'queue') {
      expect(d.needsHouseholds).toBe(MIN_HOUSEHOLDS_FOR_PROMOTION - 2);
      expect(d.needsCuration).toBe(false);
    }
  });

  it('promote only with N households + curation + low disagreement', () => {
    const d = evaluatePromotion({
      independentHouseholdCount: MIN_HOUSEHOLDS_FOR_PROMOTION,
      curated: true,
      disagreementRate: 0.05,
    });
    expect(d.action).toBe('promote');
  });

  it('high disagreement rejects even with households + curation', () => {
    const d = evaluatePromotion({
      independentHouseholdCount: 20,
      curated: true,
      disagreementRate: 0.5,
    });
    expect(d.action).toBe('reject');
  });
});
