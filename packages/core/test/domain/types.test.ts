import { describe, expect, it } from 'vitest';
import type {
  ConversionEdge,
  Ingredient,
  IngredientForm,
  Location,
  PackageSpec,
} from '../../src/domain';
import { knownAllergens } from '../../src/domain';

describe('domain shapes (structural smoke)', () => {
  it('Ingredient carries allergens and defaultFormId', () => {
    const allergens = ['milk'] as const;
    const ing: Ingredient = {
      id: 'parmesan',
      name: 'Parmesan',
      category: 'dairy',
      allergens,
      isStaple: false,
      defaultFormId: 'parmesan-grated',
    };
    expect(ing.allergens).toContain('milk');
    expect(ing.defaultFormId).toBe('parmesan-grated');
    // knownAllergens helper is the closed-tag constructor for matching
    expect(knownAllergens(allergens).unknownAllergens).toBe(false);
  });

  it('IngredientForm / ConversionEdge / PackageSpec / Location assignable', () => {
    const form: IngredientForm = {
      id: 'garlic-clove',
      ingredientId: 'garlic',
      form: 'clove',
      dim: 'count',
      gramsPerCount: 3,
      uncertaintyPct: 20,
    };
    const edge: ConversionEdge = {
      fromFormId: form.id,
      toFormId: 'garlic-minced',
      factor: 3,
      uncertaintyPct: 15,
      source: 'seed',
    };
    const oneWay: ConversionEdge = {
      ...edge,
      oneWay: true,
    };
    const pack: PackageSpec = {
      formId: form.id,
      label: 'bulb',
      netG: 60,
    };
    const loc: Location = {
      id: 'fridge',
      householdId: 'hh1',
      name: 'Fridge',
      icon: 'snowflake',
      tint: '#4a90d9',
      sortOrder: 0,
    };
    expect(form.dim).toBe('count');
    expect(edge.oneWay).toBeUndefined();
    expect(oneWay.oneWay).toBe(true);
    expect(pack.netG).toBe(60);
    expect(loc.parentId).toBeUndefined();
  });
});
