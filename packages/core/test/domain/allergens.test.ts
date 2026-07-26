import { describe, expect, it } from 'vitest';
import {
  ALLERGENS,
  allergensDisagree,
  canAutoMergeAllergens,
  isAllergen,
  knownAllergens,
  unknownAllergenTags,
} from '../../src/domain';

describe('allergen safety system', () => {
  it('includes major declarable allergens', () => {
    expect(ALLERGENS).toEqual(
      expect.arrayContaining([
        'milk',
        'egg',
        'fish',
        'shellfish',
        'tree_nut',
        'peanut',
        'wheat',
        'soy',
        'sesame',
      ]),
    );
    expect(ALLERGENS).toHaveLength(9);
  });

  it('isAllergen type guard', () => {
    expect(isAllergen('milk')).toBe(true);
    expect(isAllergen('gluten')).toBe(false);
  });

  it('identical known tags may auto-merge', () => {
    const a = knownAllergens(['milk', 'egg']);
    const b = knownAllergens(['egg', 'milk']);
    expect(allergensDisagree(a, b)).toBe(false);
    expect(canAutoMergeAllergens(a, b)).toBe(true);
  });

  it('disagreeing tags refuse auto-merge', () => {
    const a = knownAllergens(['peanut']);
    const b = knownAllergens(['tree_nut']);
    expect(allergensDisagree(a, b)).toBe(true);
    expect(canAutoMergeAllergens(a, b)).toBe(false);
  });

  it('empty vs non-empty known tags disagree', () => {
    const a = knownAllergens([]);
    const b = knownAllergens(['soy']);
    expect(allergensDisagree(a, b)).toBe(true);
  });

  it('unknownAllergens on either side refuses auto-merge', () => {
    const known = knownAllergens(['wheat']);
    const unknown = unknownAllergenTags();
    expect(allergensDisagree(known, unknown)).toBe(true);
    expect(allergensDisagree(unknown, known)).toBe(true);
    expect(allergensDisagree(unknown, unknownAllergenTags(['wheat']))).toBe(
      true,
    );
    expect(canAutoMergeAllergens(known, unknown)).toBe(false);
  });
});
