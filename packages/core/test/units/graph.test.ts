import { describe, expect, it } from 'vitest';
import {
  convert,
  type ConversionEdge,
  type IngredientForm,
} from '../../src/units';

describe('deterministic tie-breaking', () => {
  /**
   * Graph with two equal-length (1-hop) paths A→C:
   *   edge low-unc:  uncertainty 10, key "A->C|seed-a" vs
   * Actually same endpoints need disambiguation by source.
   *
   * Better: two 2-hop paths of equal length and equal total uncertainty,
   * distinguished only by path key order.
   *
   *   A → B1 → C   factors 2, 1  unc 3+3=6  path keys B1-branch
   *   A → B2 → C   factors 2, 1  unc 3+3=6  path keys B2-branch
   *
   * Lexicographic on full path key: "A->B1 | B1->C" vs "A->B2 | B2->C"
   * "A->B1 | B1->C" < "A->B2 | B2->C" → must pick B1 path stably.
   */
  const forms: IngredientForm[] = ['A', 'B1', 'B2', 'C'].map((id) => ({
    id,
    ingredientId: 'x',
    form: id.toLowerCase(),
    dim: 'mass' as const,
    uncertaintyPct: 0,
  }));

  const edges: ConversionEdge[] = [
    // Register B2 edges first in the array to prove insertion order does not win
    { fromFormId: 'A', toFormId: 'B2', factor: 2, uncertaintyPct: 3, source: 'seed' },
    { fromFormId: 'B2', toFormId: 'C', factor: 1, uncertaintyPct: 3, source: 'seed' },
    { fromFormId: 'A', toFormId: 'B1', factor: 2, uncertaintyPct: 3, source: 'seed' },
    { fromFormId: 'B1', toFormId: 'C', factor: 1, uncertaintyPct: 3, source: 'seed' },
  ];

  it('equal length + equal uncertainty → lexicographically smallest path key', () => {
    const r = convert({
      value: 5,
      fromUnit: 'g',
      toUnit: 'g',
      fromFormId: 'A',
      toFormId: 'C',
      forms,
      edges,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.path).toEqual(['A->B1', 'B1->C']);
    expect(r.value).toBe(10);
    expect(r.uncertaintyPct).toBe(6);
  });

  it('same inputs always produce the same path (stability)', () => {
    const paths: string[][] = [];
    for (let i = 0; i < 20; i++) {
      const r = convert({
        value: 5,
        fromUnit: 'g',
        toUnit: 'g',
        fromFormId: 'A',
        toFormId: 'C',
        forms,
        edges: [...edges].reverse(), // reverse copy each time still same set
      });
      expect(r.ok).toBe(true);
      if (r.ok) paths.push([...r.path]);
    }
    const first = paths[0]!.join('|');
    for (const p of paths) {
      expect(p.join('|')).toBe(first);
    }
    expect(first).toBe('A->B1|B1->C');
  });

  it('lower uncertainty wins when hop counts tie', () => {
    const edgesUnc: ConversionEdge[] = [
      { fromFormId: 'A', toFormId: 'B1', factor: 1, uncertaintyPct: 10, source: 'seed' },
      { fromFormId: 'B1', toFormId: 'C', factor: 1, uncertaintyPct: 10, source: 'seed' },
      { fromFormId: 'A', toFormId: 'B2', factor: 1, uncertaintyPct: 1, source: 'seed' },
      { fromFormId: 'B2', toFormId: 'C', factor: 1, uncertaintyPct: 1, source: 'seed' },
    ];
    const r = convert({
      value: 1,
      fromUnit: 'g',
      toUnit: 'g',
      fromFormId: 'A',
      toFormId: 'C',
      forms,
      edges: edgesUnc,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.path).toEqual(['A->B2', 'B2->C']);
    expect(r.uncertaintyPct).toBe(2);
  });
});

describe('cycles do not hang', () => {
  it('cyclic graph still finds path and terminates', () => {
    const forms: IngredientForm[] = ['A', 'B', 'C'].map((id) => ({
      id,
      ingredientId: 'x',
      form: id,
      dim: 'mass' as const,
      uncertaintyPct: 0,
    }));
    const edges: ConversionEdge[] = [
      { fromFormId: 'A', toFormId: 'B', factor: 2, uncertaintyPct: 1, source: 'seed' },
      { fromFormId: 'B', toFormId: 'A', factor: 0.5, uncertaintyPct: 1, source: 'seed' },
      { fromFormId: 'B', toFormId: 'C', factor: 3, uncertaintyPct: 2, source: 'seed' },
      { fromFormId: 'C', toFormId: 'B', factor: 1 / 3, uncertaintyPct: 2, source: 'seed' },
      { fromFormId: 'C', toFormId: 'A', factor: 1 / 6, uncertaintyPct: 5, source: 'seed' },
    ];

    const start = Date.now();
    const r = convert({
      value: 1,
      fromUnit: 'g',
      toUnit: 'g',
      fromFormId: 'A',
      toFormId: 'C',
      forms,
      edges,
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // With auto-invert, declared C→A (factor 1/6) yields A→C~inv (factor 6)
    // as a 1-hop path — fewest hops beats the 2-hop A→B→C (same product 6).
    // Pre-invert expectation was ['A->B','B->C']; path changed under CR(a).
    expect(r.value).toBeCloseTo(6, 10);
    expect(r.path).toEqual(['A->C~inv']);
    expect(r.uncertaintyPct).toBe(5);
  });

  it('unreachable node in cyclic component returns no-path quickly', () => {
    const forms: IngredientForm[] = ['A', 'B', 'Z'].map((id) => ({
      id,
      ingredientId: 'x',
      form: id,
      dim: 'mass' as const,
      uncertaintyPct: 0,
    }));
    const edges: ConversionEdge[] = [
      { fromFormId: 'A', toFormId: 'B', factor: 1, uncertaintyPct: 1, source: 'seed' },
      { fromFormId: 'B', toFormId: 'A', factor: 1, uncertaintyPct: 1, source: 'seed' },
      // Z isolated
    ];
    const r = convert({
      value: 1,
      fromUnit: 'g',
      toUnit: 'g',
      fromFormId: 'A',
      toFormId: 'Z',
      forms,
      edges,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-path');
  });
});

describe('form graph multiplies factors along path', () => {
  it('clove → minced edge then minced mass unit', () => {
    const clove: IngredientForm = {
      id: 'garlic-clove',
      ingredientId: 'garlic',
      form: 'clove',
      dim: 'count',
      gramsPerCount: 3,
      uncertaintyPct: 20,
    };
    const minced: IngredientForm = {
      id: 'garlic-minced',
      ingredientId: 'garlic',
      form: 'minced',
      dim: 'mass',
      uncertaintyPct: 0,
    };
    // 1 clove = 3 g minced (edge in form base units: each → g)
    const edges: ConversionEdge[] = [
      {
        fromFormId: 'garlic-clove',
        toFormId: 'garlic-minced',
        factor: 3,
        uncertaintyPct: 15,
        source: 'seed',
      },
    ];
    const r = convert({
      value: 4,
      fromUnit: 'each',
      toUnit: 'g',
      fromFormId: clove.id,
      toFormId: minced.id,
      forms: [clove, minced],
      edges,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(12);
    expect(r.uncertaintyPct).toBe(15);
  });
});

describe('bidirectional edges (auto-invert)', () => {
  const clove: IngredientForm = {
    id: 'garlic-clove',
    ingredientId: 'garlic',
    form: 'clove',
    dim: 'count',
    gramsPerCount: 3,
    uncertaintyPct: 20,
  };
  const minced: IngredientForm = {
    id: 'garlic-minced',
    ingredientId: 'garlic',
    form: 'minced',
    dim: 'mass',
    uncertaintyPct: 0,
  };

  it('declared A→B is walkable as B→A via inverse (same uncertainty, ~inv path key)', () => {
    const edges: ConversionEdge[] = [
      {
        fromFormId: 'garlic-clove',
        toFormId: 'garlic-minced',
        factor: 3,
        uncertaintyPct: 15,
        source: 'seed',
      },
    ];
    const r = convert({
      value: 12,
      fromUnit: 'g',
      toUnit: 'each',
      fromFormId: minced.id,
      toFormId: clove.id,
      forms: [clove, minced],
      edges,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(4, 10);
    expect(r.uncertaintyPct).toBe(15);
    expect(r.path).toEqual(['garlic-minced->garlic-clove~inv']);
  });

  it('oneWay: true does not auto-invert (lossy yield)', () => {
    const whole: IngredientForm = {
      id: 'chicken-whole',
      ingredientId: 'chicken',
      form: 'whole',
      dim: 'mass',
      uncertaintyPct: 0,
    };
    const boneless: IngredientForm = {
      id: 'chicken-boneless',
      ingredientId: 'chicken',
      form: 'boneless',
      dim: 'mass',
      uncertaintyPct: 0,
    };
    const edges: ConversionEdge[] = [
      {
        fromFormId: 'chicken-whole',
        toFormId: 'chicken-boneless',
        factor: 0.7,
        uncertaintyPct: 10,
        source: 'yield',
        oneWay: true,
      },
    ];
    const forward = convert({
      value: 1000,
      fromUnit: 'g',
      toUnit: 'g',
      fromFormId: whole.id,
      toFormId: boneless.id,
      forms: [whole, boneless],
      edges,
    });
    expect(forward.ok).toBe(true);
    if (forward.ok) expect(forward.value).toBeCloseTo(700, 10);

    const reverse = convert({
      value: 700,
      fromUnit: 'g',
      toUnit: 'g',
      fromFormId: boneless.id,
      toFormId: whole.id,
      forms: [whole, boneless],
      edges,
    });
    expect(reverse.ok).toBe(false);
    if (!reverse.ok) expect(reverse.reason).toBe('no-path');
  });

  it('inverse-edge ties remain deterministic (lex smallest path key wins)', () => {
    // Only declare A→B1 and A→B2; reach C only via declared B*→C.
    // Reverse walk C→A has two equal-length inverse+forward hybrids:
    //   C→B1~inv then B1→A~inv  vs  C→B2~inv then B2→A~inv
    // Actually: declared A→B1, B1→C, A→B2, B2→C. Inverse: B1→A, C→B1, B2→A, C→B2.
    // Path C→A via B1: C->B1~inv | B1->A~inv
    // Path C→A via B2: C->B2~inv | B2->A~inv
    // Lex: "C->B1~inv | B1->A~inv" < "C->B2~inv | B2->A~inv"
    const forms: IngredientForm[] = ['A', 'B1', 'B2', 'C'].map((id) => ({
      id,
      ingredientId: 'x',
      form: id.toLowerCase(),
      dim: 'mass' as const,
      uncertaintyPct: 0,
    }));
    const edges: ConversionEdge[] = [
      { fromFormId: 'A', toFormId: 'B2', factor: 2, uncertaintyPct: 3, source: 'seed' },
      { fromFormId: 'B2', toFormId: 'C', factor: 1, uncertaintyPct: 3, source: 'seed' },
      { fromFormId: 'A', toFormId: 'B1', factor: 2, uncertaintyPct: 3, source: 'seed' },
      { fromFormId: 'B1', toFormId: 'C', factor: 1, uncertaintyPct: 3, source: 'seed' },
    ];

    const paths: string[] = [];
    for (let i = 0; i < 15; i++) {
      const r = convert({
        value: 10,
        fromUnit: 'g',
        toUnit: 'g',
        fromFormId: 'C',
        toFormId: 'A',
        forms,
        edges: i % 2 === 0 ? edges : [...edges].reverse(),
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        paths.push(r.path.join('|'));
        // reverse factors: C→B1 (1/1) → A (1/2) ⇒ factor 0.5
        expect(r.value).toBeCloseTo(5, 10);
        expect(r.uncertaintyPct).toBe(6);
      }
    }
    for (const p of paths) {
      expect(p).toBe('C->B1~inv|B1->A~inv');
    }
  });

  it('explicit reverse edge preferred over auto-inverse when keys allow (both present)', () => {
    // Declared A→B and B→A; both directions should work without ~inv on declared path.
    const forms: IngredientForm[] = ['A', 'B'].map((id) => ({
      id,
      ingredientId: 'x',
      form: id,
      dim: 'mass' as const,
      uncertaintyPct: 0,
    }));
    const edges: ConversionEdge[] = [
      { fromFormId: 'A', toFormId: 'B', factor: 2, uncertaintyPct: 1, source: 'seed' },
      { fromFormId: 'B', toFormId: 'A', factor: 0.5, uncertaintyPct: 1, source: 'seed' },
    ];
    const r = convert({
      value: 4,
      fromUnit: 'g',
      toUnit: 'g',
      fromFormId: 'B',
      toFormId: 'A',
      forms,
      edges,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Declared "B->A" vs auto "B->A~inv" — lex: "B->A" < "B->A~inv"
    expect(r.path).toEqual(['B->A']);
    expect(r.value).toBeCloseTo(2, 10);
  });
});
