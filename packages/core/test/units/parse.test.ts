import { describe, expect, it } from 'vitest';

import { parseQuantity } from '../../src/units';

describe('parseQuantity — fractions, unicode, decimals', () => {
  it('mixed ASCII fraction: "1 1/2 cups"', () => {
    const r = parseQuantity('1 1/2 cups');
    expect(r.kind).toBe('quantity');
    if (r.kind !== 'quantity') return;
    expect(r.qty).toBe(1.5);
    expect(r.unit).toBe('cup');
    expect(r.unitKnown).toBe(true);
    expect(r.isRange).toBe(false);
  });

  it('unicode vulgar fractions', () => {
    const half = parseQuantity('½ cup');
    expect(half.kind).toBe('quantity');
    if (half.kind === 'quantity') {
      expect(half.qty).toBe(0.5);
      expect(half.unit).toBe('cup');
    }

    const mixed = parseQuantity('1½ tbsp');
    expect(mixed.kind).toBe('quantity');
    if (mixed.kind === 'quantity') {
      expect(mixed.qty).toBe(1.5);
      expect(mixed.unit).toBe('tbsp');
    }

    const threeQ = parseQuantity('¾ tsp');
    expect(threeQ.kind).toBe('quantity');
    if (threeQ.kind === 'quantity') {
      expect(threeQ.qty).toBe(0.75);
      expect(threeQ.unit).toBe('tsp');
    }

    const quarter = parseQuantity('¼ cup');
    expect(quarter.kind).toBe('quantity');
    if (quarter.kind === 'quantity') expect(quarter.qty).toBe(0.25);
  });

  it('decimals', () => {
    const r = parseQuantity('1.5 cups');
    expect(r.kind).toBe('quantity');
    if (r.kind === 'quantity') {
      expect(r.qty).toBe(1.5);
      expect(r.unit).toBe('cup');
    }
  });

  it('simple fraction "3/4 cup"', () => {
    const r = parseQuantity('3/4 cup');
    expect(r.kind).toBe('quantity');
    if (r.kind === 'quantity') {
      expect(r.qty).toBe(0.75);
      expect(r.unit).toBe('cup');
    }
  });

  it('fl oz multi-word unit', () => {
    const r = parseQuantity('8 fl oz');
    expect(r.kind).toBe('quantity');
    if (r.kind === 'quantity') {
      expect(r.qty).toBe(8);
      expect(r.unit).toBe('fl oz');
      expect(r.unitKnown).toBe(true);
    }
  });
});

describe('parseQuantity — ranges', () => {
  it('"2-3 cloves" → midpoint 2.5, low 2, high 3, isRange true', () => {
    const r = parseQuantity('2-3 cloves');
    expect(r.kind).toBe('quantity');
    if (r.kind !== 'quantity') return;
    expect(r.qty).toBe(2.5);
    expect(r.low).toBe(2);
    expect(r.high).toBe(3);
    expect(r.isRange).toBe(true);
    expect(r.unit).toBe('each'); // cloves alias
    expect(r.unitKnown).toBe(true);
  });

  it('"2 to 3 cups" exposes low/high (grocery wants high, pantry wants mid)', () => {
    const r = parseQuantity('2 to 3 cups');
    expect(r.kind).toBe('quantity');
    if (r.kind === 'quantity') {
      expect(r.qty).toBe(2.5);
      expect(r.low).toBe(2);
      expect(r.high).toBe(3);
      expect(r.isRange).toBe(true);
      expect(r.unit).toBe('cup');
    }
  });

  it('reversed range "3-2" still normalizes low <= high', () => {
    const r = parseQuantity('3-2 tsp');
    expect(r.kind).toBe('quantity');
    if (r.kind === 'quantity') {
      expect(r.low).toBe(2);
      expect(r.high).toBe(3);
      expect(r.qty).toBe(2.5);
      expect(r.isRange).toBe(true);
    }
  });

  it('non-range sets low === high === qty', () => {
    const r = parseQuantity('1.5 cups');
    expect(r.kind).toBe('quantity');
    if (r.kind === 'quantity') {
      expect(r.low).toBe(1.5);
      expect(r.high).toBe(1.5);
      expect(r.qty).toBe(1.5);
      expect(r.isRange).toBe(false);
    }
  });
});

describe('parseQuantity — ambiguousLocale', () => {
  it('pint / quart / gallon / fl oz / cup flag ambiguousLocale', () => {
    for (const text of ['1 pint', '2 quarts', '1 gallon', '8 fl oz', '1 cup']) {
      const r = parseQuantity(text);
      expect(r.kind).toBe('quantity');
      if (r.kind === 'quantity') {
        expect(r.ambiguousLocale).toBe(true);
        expect(r.unitKnown).toBe(true);
      }
    }
  });

  it('metric and mass units do not flag ambiguousLocale', () => {
    for (const text of ['100 ml', '1 kg', '3 tsp', '2 tbsp', '12 each']) {
      const r = parseQuantity(text);
      expect(r.kind).toBe('quantity');
      if (r.kind === 'quantity') {
        expect(r.ambiguousLocale).toBe(false);
      }
    }
  });

  it('unknown unit token is not ambiguousLocale', () => {
    const r = parseQuantity('2 bunches');
    expect(r.kind).toBe('quantity');
    if (r.kind === 'quantity') {
      expect(r.unitKnown).toBe(false);
      expect(r.ambiguousLocale).toBe(false);
    }
  });
});

describe('parseQuantity — non-quantified (NOT zero)', () => {
  it('"a pinch" is non-quantified', () => {
    const r = parseQuantity('a pinch');
    expect(r.kind).toBe('non-quantified');
    if (r.kind === 'non-quantified') {
      expect(r.phrase).toBe('pinch');
    }
    // Critical: must not be quantity 0
    expect(r).not.toMatchObject({ kind: 'quantity', qty: 0 });
  });

  it('"to taste" is non-quantified', () => {
    const r = parseQuantity('to taste');
    expect(r.kind).toBe('non-quantified');
    if (r.kind === 'non-quantified') expect(r.phrase).toBe('to-taste');
  });

  it('"as needed" is non-quantified', () => {
    const r = parseQuantity('as needed');
    expect(r.kind).toBe('non-quantified');
  });

  it('"salt to taste" (ingredient + phrase) is non-quantified', () => {
    const r = parseQuantity('salt to taste');
    expect(r.kind).toBe('non-quantified');
    if (r.kind === 'non-quantified') expect(r.phrase).toBe('to-taste');
  });

  it('"pinch" alone', () => {
    const r = parseQuantity('pinch');
    expect(r.kind).toBe('non-quantified');
  });
});

describe('parseQuantity — edge cases', () => {
  it('empty → unparsed', () => {
    const r = parseQuantity('');
    expect(r.kind).toBe('unparsed');
  });

  it('article + unit: "a cup"', () => {
    const r = parseQuantity('a cup');
    expect(r.kind).toBe('quantity');
    if (r.kind === 'quantity') {
      expect(r.qty).toBe(1);
      expect(r.unit).toBe('cup');
    }
  });

  it('unknown unit still returns quantity with unitKnown false', () => {
    const r = parseQuantity('2 bunches');
    expect(r.kind).toBe('quantity');
    if (r.kind === 'quantity') {
      expect(r.qty).toBe(2);
      expect(r.unit).toBe('bunches');
      expect(r.unitKnown).toBe(false);
    }
  });

  it('bare number without unit', () => {
    const r = parseQuantity('3');
    expect(r.kind).toBe('quantity');
    if (r.kind === 'quantity') {
      expect(r.qty).toBe(3);
      expect(r.unit).toBe('');
      expect(r.unitKnown).toBe(false);
    }
  });
});
