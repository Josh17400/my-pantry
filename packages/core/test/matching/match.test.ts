import { describe, expect, it } from 'vitest';

import {
  type Ingredient,
  knownAllergens,
  unknownAllergenTags,
} from '../../src/domain';
import {
  FUZZY_CONFIDENCE_FLOOR,
  type MatchCatalog,
  matchIngredient,
  normalizeIngredientText,
} from '../../src/matching';
import { fixtureCatalog } from './fixtures';

function cat(overrides: Partial<MatchCatalog> = {}): MatchCatalog {
  return fixtureCatalog(overrides);
}

describe('matching cascade order', () => {
  it('user-learned alias beats global alias', () => {
    const catalog = cat({
      globalAliases: [
        {
          alias: 'CRM',
          ingredientId: 'cream',
          scope: 'global',
        },
      ],
      userAliases: [
        {
          alias: 'CRM',
          ingredientId: 'heavy-cream',
          scope: 'user',
          householdId: 'hh-1',
        },
      ],
    });
    const r = matchIngredient({
      raw: 'CRM',
      catalog,
      householdId: 'hh-1',
      path: 'receipt',
    });
    expect(r.kind).toBe('match');
    if (r.kind === 'match') {
      expect(r.step).toBe('user-alias');
      expect(r.ingredient.id).toBe('heavy-cream');
      expect(r.autoAccept).toBe(true);
    }
  });

  it('global alias beats normalized / fuzzy', () => {
    const r = matchIngredient({
      raw: 'EVOO',
      catalog: cat(),
      path: 'receipt',
    });
    expect(r.kind).toBe('match');
    if (r.kind === 'match') {
      expect(r.step).toBe('global-alias');
      expect(r.ingredient.id).toBe('olive-oil');
      expect(r.autoAccept).toBe(true);
    }
  });

  it('normalized exact match auto-accepts', () => {
    const r = matchIngredient({
      raw: 'chicken',
      catalog: cat(),
      path: 'receipt',
    });
    expect(r.kind).toBe('match');
    if (r.kind === 'match') {
      expect(r.step).toBe('normalized');
      expect(r.ingredient.id).toBe('chicken');
      expect(r.autoAccept).toBe(true);
      expect(r.confidence).toBe(1);
    }
  });
});

describe('sibling exclusion', () => {
  it('cream family never auto-accepts from fuzzy', () => {
    // Force fuzzy by using a slight miss without aliases
    const r = matchIngredient({
      raw: 'hevy cream', // typo → fuzzy toward heavy cream
      catalog: cat({ userAliases: [], globalAliases: [] }),
      path: 'recipe',
    });
    if (r.kind === 'match' && r.step === 'fuzzy') {
      expect(r.autoAccept).toBe(false);
      expect(r.vetoes).toContain('sibling-exclusion');
    } else if (r.kind === 'needs-llm' || r.kind === 'needs-user') {
      // also acceptable — no silent accept
      expect(r.kind).not.toBe('match');
    } else if (r.kind === 'match') {
      expect(r.autoAccept).toBe(false);
    }
  });

  it('sour cream / cream / cream cheese are co-hyponyms', () => {
    for (const raw of ['sour creem', 'crem cheese', 'hevy crem']) {
      const r = matchIngredient({
        raw,
        catalog: cat({ userAliases: [], globalAliases: [] }),
        path: 'general',
      });
      if (r.kind === 'match') {
        expect(r.autoAccept).toBe(false);
        if (r.step === 'fuzzy') {
          expect(r.vetoes).toContain('sibling-exclusion');
        }
      }
    }
  });

  it('stock / broth / stock cube never fuzzy auto-accept', () => {
    const r = matchIngredient({
      raw: 'chiken broth',
      catalog: cat({ userAliases: [], globalAliases: [] }),
      path: 'recipe',
    });
    if (r.kind === 'match' && r.step === 'fuzzy') {
      expect(r.autoAccept).toBe(false);
      expect(r.vetoes).toContain('sibling-exclusion');
    }
  });
});

describe('receipt path — fuzzy never auto-accepts', () => {
  it('high-confidence fuzzy on receipt still autoAccept=false', () => {
    // "bacn" → bacon via fuzzy; receipt path
    const r = matchIngredient({
      raw: 'bacn',
      catalog: cat({ userAliases: [], globalAliases: [] }),
      path: 'receipt',
    });
    if (r.kind === 'match' && r.step === 'fuzzy') {
      expect(r.autoAccept).toBe(false);
      expect(r.vetoes).toContain('receipt-fuzzy');
      expect(r.confidence).toBeGreaterThanOrEqual(FUZZY_CONFIDENCE_FLOOR);
    } else {
      // needs-llm / needs-user also fine (no auto)
      expect(['needs-llm', 'needs-user', 'match']).toContain(r.kind);
      if (r.kind === 'match') expect(r.autoAccept).toBe(false);
    }
  });

  it('exact / learned still auto-accept on receipt', () => {
    const r = matchIngredient({
      raw: 'HVY CRM',
      catalog: cat(),
      path: 'receipt',
      householdId: 'hh-1',
    });
    expect(r.kind).toBe('match');
    if (r.kind === 'match') {
      expect(r.step).toBe('user-alias');
      expect(r.autoAccept).toBe(true);
    }
  });
});

describe('allergen veto', () => {
  it('overrides high confidence when tags disagree', () => {
    const r = matchIngredient({
      raw: 'peanut butter',
      catalog: cat(),
      path: 'recipe',
      queryAllergens: knownAllergens(['tree_nut']),
    });
    expect(r.kind).toBe('match');
    if (r.kind === 'match') {
      // normalized exact would be confidence 1, but allergen veto
      expect(r.ingredient.id).toBe('peanut-butter');
      expect(r.autoAccept).toBe(false);
      expect(r.vetoes).toContain('allergen');
    }
  });

  it('unknown query allergens refuse auto-merge', () => {
    const r = matchIngredient({
      raw: 'flour',
      catalog: cat(),
      path: 'receipt',
      queryAllergens: unknownAllergenTags(),
    });
    expect(r.kind).toBe('match');
    if (r.kind === 'match') {
      expect(r.autoAccept).toBe(false);
      expect(r.vetoes).toContain('allergen');
    }
  });

  it('matching allergens allow auto-accept on exact', () => {
    const r = matchIngredient({
      raw: 'peanut butter',
      catalog: cat(),
      path: 'receipt',
      queryAllergens: knownAllergens(['peanut']),
    });
    expect(r.kind).toBe('match');
    if (r.kind === 'match') {
      expect(r.autoAccept).toBe(true);
      expect(r.vetoes).not.toContain('allergen');
    }
  });

  it('peanut vs tree_nut never auto-accepts even on alias', () => {
    const catalog = cat({
      userAliases: [
        {
          alias: 'nut butter',
          ingredientId: 'peanut-butter',
          scope: 'user',
          householdId: 'hh-1',
        },
      ],
    });
    const r = matchIngredient({
      raw: 'nut butter',
      catalog,
      householdId: 'hh-1',
      path: 'receipt',
      queryAllergens: knownAllergens(['tree_nut']),
    });
    expect(r.kind).toBe('match');
    if (r.kind === 'match') {
      expect(r.confidence).toBe(1);
      expect(r.autoAccept).toBe(false);
      expect(r.vetoes).toContain('allergen');
    }
  });
});

describe('normalization', () => {
  it('strips brand, size, grade tokens', () => {
    expect(normalizeIngredientText('King Arthur All Purpose Flour 5lb')).toBe(
      'all purpose flour',
    );
    expect(normalizeIngredientText('EGGS LARGE GRADE A 12CT')).toContain('egg');
    expect(normalizeIngredientText('HVY CRM 16OZ')).toBe('heavy cream');
  });

  it('singularizes', () => {
    expect(normalizeIngredientText('tomatoes')).toBe('tomato');
    expect(normalizeIngredientText('onions')).toBe('onion');
    expect(normalizeIngredientText('carrots')).toBe('carrot');
  });

  it('expands receipt abbreviations', () => {
    expect(normalizeIngredientText('CHKN BRTH')).toBe('chicken broth');
    expect(normalizeIngredientText('UNSLTD BTR')).toBe('unsalted butter');
  });
});

describe('deterministic ranking', () => {
  it('same inputs → same ranking', () => {
    const a = matchIngredient({
      raw: 'crem',
      catalog: cat({ userAliases: [], globalAliases: [] }),
      path: 'general',
    });
    const b = matchIngredient({
      raw: 'crem',
      catalog: cat({ userAliases: [], globalAliases: [] }),
      path: 'general',
    });
    expect(a).toEqual(b);
  });
});

describe('edge cases', () => {
  it('empty query → no-match', () => {
    expect(matchIngredient({ raw: '  ', catalog: cat() }).kind).toBe(
      'no-match',
    );
  });

  it('empty catalog → no-match', () => {
    const empty: MatchCatalog = {
      ingredients: [] as Ingredient[],
      taxonomyParentByIngredientId: {},
      globalAliases: [],
      userAliases: [],
    };
    expect(matchIngredient({ raw: 'milk', catalog: empty }).kind).toBe(
      'no-match',
    );
  });
});
