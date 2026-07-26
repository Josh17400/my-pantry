import { describe, expect, it } from 'vitest';

import {
  ALLERGENS,
  allergensDisagree,
  BASE_UNIT,
  convert,
  CORE_PACKAGE_NAME,
  type Dimension,
  foldLedger,
  type Ingredient,
  knownAllergens,
  type PantryTxn,
  parseQuantity,
  unknownAllergenTags,
} from '../../src/index';

describe('root barrel wiring', () => {
  it('exports package health + domain + units + pantry', () => {
    expect(CORE_PACKAGE_NAME).toBe('@larder/core');
    expect(BASE_UNIT.mass).toBe('g');
    expect(ALLERGENS.length).toBe(9);

    const dim: Dimension = 'volume';
    expect(dim).toBe('volume');

    const r = parseQuantity('2-3 cups');
    expect(r.kind).toBe('quantity');
    if (r.kind === 'quantity') {
      expect(r.low).toBe(2);
      expect(r.high).toBe(3);
      expect(r.ambiguousLocale).toBe(true);
    }

    const c = convert({ value: 1, fromUnit: 'cup', toUnit: 'ml' });
    expect(c.ok).toBe(true);

    expect(
      allergensDisagree(knownAllergens(['peanut']), knownAllergens(['soy'])),
    ).toBe(true);
    expect(unknownAllergenTags().unknownAllergens).toBe(true);
  });

  it('pantry fold reachable from root', () => {
    const txns: PantryTxn[] = [
      {
        id: '1',
        clientTxnId: 'c1',
        householdId: 'h',
        ingredientId: 'flour',
        formId: 'flour-ap',
        kind: 'relative',
        reason: 'purchase',
        deltaBase: 1000,
        occurredAt: '2026-01-01T00:00:00.000Z',
        deviceId: 'd',
        userId: 'u',
      },
    ];
    const result = foldLedger(txns);
    expect(result.qtyBase).toBe(1000);
  });

  it('Ingredient type is available for seed authors', () => {
    const ing: Ingredient = {
      id: 'x',
      name: 'X',
      category: 'other',
      allergens: [],
      dietaryFlags: [],
      isStaple: true,
      defaultFormId: 'x-whole',
    };
    expect(ing.isStaple).toBe(true);
  });
});
