import { describe, expect, it } from 'vitest';

import {
  ALLERGENS,
  allergensDisagree,
  canAutoMergeAllergens,
  canAutoMergeDietaryFlags,
  canAutoMergeSafety,
  DIETARY_FLAGS,
  dietaryFlagsDisagree,
  ingredientHitsAvoidList,
  isAllergen,
  isDietaryFlag,
  knownAllergens,
  knownDietaryFlags,
  safetyTagsDisagree,
  unknownAllergenTags,
  unknownDietaryTags,
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

describe('dietary flag axis (separate from FALCPA)', () => {
  it('includes practical dietary flags including gluten', () => {
    expect(DIETARY_FLAGS).toEqual(
      expect.arrayContaining([
        'gluten',
        'pork',
        'alcohol',
        'beef',
        'shellfish-derived',
      ]),
    );
    expect(isDietaryFlag('gluten')).toBe(true);
    expect(isDietaryFlag('wheat')).toBe(false);
  });

  it('identical known dietary flags may auto-merge', () => {
    const a = knownDietaryFlags(['gluten', 'pork']);
    const b = knownDietaryFlags(['pork', 'gluten']);
    expect(dietaryFlagsDisagree(a, b)).toBe(false);
    expect(canAutoMergeDietaryFlags(a, b)).toBe(true);
  });

  it('gluten-free vs gluten-containing refuses auto-merge', () => {
    const glutenFree = knownDietaryFlags([]);
    const barley = knownDietaryFlags(['gluten']);
    expect(dietaryFlagsDisagree(glutenFree, barley)).toBe(true);
    expect(canAutoMergeDietaryFlags(glutenFree, barley)).toBe(false);
  });

  it('unknown dietary flags refuse auto-merge', () => {
    const known = knownDietaryFlags(['gluten']);
    const unknown = unknownDietaryTags();
    expect(dietaryFlagsDisagree(known, unknown)).toBe(true);
    expect(canAutoMergeDietaryFlags(known, unknown)).toBe(false);
  });

  it('combined safety gate: gluten disagree alone blocks merge', () => {
    const aAllergens = knownAllergens([]); // no FALCPA wheat
    const bAllergens = knownAllergens([]); // barley has no wheat allergen
    const aDiet = knownDietaryFlags([]); // gluten-free user / clear item
    const bDiet = knownDietaryFlags(['gluten']); // barley
    expect(allergensDisagree(aAllergens, bAllergens)).toBe(false);
    expect(
      safetyTagsDisagree(aAllergens, bAllergens, aDiet, bDiet),
    ).toBe(true);
    expect(
      canAutoMergeSafety(aAllergens, bAllergens, aDiet, bDiet),
    ).toBe(false);
  });

  it('ingredientHitsAvoidList: gluten avoid blocks gluten-flagged ingredient', () => {
    expect(
      ingredientHitsAvoidList({
        allergens: [],
        dietaryFlags: ['gluten'],
        avoidAllergens: [],
        avoidDietaryFlags: ['gluten'],
      }),
    ).toBe(true);
  });

  it('ingredientHitsAvoidList: wheat allergen blocked for wheat-avoiding user', () => {
    expect(
      ingredientHitsAvoidList({
        allergens: ['wheat'],
        dietaryFlags: ['gluten'],
        avoidAllergens: ['wheat'],
        avoidDietaryFlags: [],
      }),
    ).toBe(true);
  });

  it('ingredientHitsAvoidList: unknown is unsafe when user has avoids', () => {
    expect(
      ingredientHitsAvoidList({
        allergens: [],
        dietaryFlags: [],
        unknownAllergens: true,
        avoidAllergens: ['milk'],
        avoidDietaryFlags: [],
      }),
    ).toBe(true);
    expect(
      ingredientHitsAvoidList({
        allergens: [],
        dietaryFlags: [],
        unknownDietaryFlags: true,
        avoidAllergens: [],
        avoidDietaryFlags: ['gluten'],
      }),
    ).toBe(true);
  });

  it('ingredientHitsAvoidList: clear ingredient with no hits is safe', () => {
    expect(
      ingredientHitsAvoidList({
        allergens: [],
        dietaryFlags: [],
        avoidAllergens: ['wheat'],
        avoidDietaryFlags: ['gluten'],
      }),
    ).toBe(false);
  });
});
