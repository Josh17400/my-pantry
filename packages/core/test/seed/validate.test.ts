import { describe, expect, it } from 'vitest';
import type { ConversionEdge, IngredientForm } from '../../src/domain';
import {
  assertSeedValid,
  countByCategory,
  normalizeAlias,
  seedCatalog,
  seedEdges,
  seedForms,
  seedIngredients,
  seedPackages,
  undirectedEdgeKey,
  validateSeed,
  type SeedCategoryBundle,
  type SeedIngredient,
} from '../../src/seed';

describe('seed catalog integrity', () => {
  it('validateSeed() passes on shipped catalog', () => {
    const result = validateSeed(seedCatalog);
    if (!result.ok) {
      // Surface every issue for debugging
      console.error(result.issues);
    }
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('assertSeedValid does not throw on shipped catalog', () => {
    expect(() => assertSeedValid()).not.toThrow();
  });

  it('has ~300 ingredients (target range 280–400)', () => {
    const n = seedIngredients.length;
    expect(n).toBeGreaterThanOrEqual(280);
    expect(n).toBeLessThanOrEqual(400);
  });

  it('every ingredient has at least one form', () => {
    const formCount = new Map<string, number>();
    for (const f of seedForms) {
      formCount.set(f.ingredientId, (formCount.get(f.ingredientId) ?? 0) + 1);
    }
    for (const ing of seedIngredients) {
      expect(formCount.get(ing.id) ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('counts by category are non-empty for expected aisles', () => {
    const by = countByCategory();
    const expected = [
      'produce',
      'dairy',
      'meat-seafood',
      'grains-pasta',
      'pantry-staples',
      'canned',
      'baking',
      'spices-herbs',
      'condiments',
      'oils-vinegars',
      'frozen',
      'beverages',
      'baby-household',
    ];
    for (const cat of expected) {
      expect(by[cat] ?? 0, cat).toBeGreaterThan(0);
    }
  });

  it('ships packages, forms, and edges', () => {
    expect(seedForms.length).toBeGreaterThan(seedIngredients.length);
    expect(seedPackages.length).toBeGreaterThan(50);
    expect(seedEdges.length).toBeGreaterThan(5);
  });
});

describe('validateSeed rules', () => {
  const baseIng = (over: Partial<SeedIngredient> = {}): SeedIngredient => ({
    id: 'test-ing',
    name: 'Test Ingredient',
    category: 'test',
    allergens: [],
    isStaple: false,
    defaultFormId: 'test-ing-bulk',
    aliases: [],
    ...over,
  });

  const baseForm = (over: Partial<IngredientForm> = {}): IngredientForm => ({
    id: 'test-ing-bulk',
    ingredientId: 'test-ing',
    form: 'bulk',
    dim: 'mass',
    uncertaintyPct: 5,
    ...over,
  });

  function catalog(
    partial: Partial<SeedCategoryBundle>,
  ): SeedCategoryBundle {
    return {
      ingredients: partial.ingredients ?? [baseIng()],
      forms: partial.forms ?? [baseForm()],
      edges: partial.edges ?? [],
      packages: partial.packages ?? [],
    };
  }

  it('fails when defaultFormId is missing', () => {
    const r = validateSeed(
      catalog({
        ingredients: [baseIng({ defaultFormId: 'nope' })],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'missing_default_form')).toBe(true);
  });

  it('fails on duplicate ingredient ids', () => {
    const r = validateSeed(
      catalog({
        ingredients: [baseIng(), baseIng({ name: 'Other' })],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'duplicate_ingredient_id')).toBe(
      true,
    );
  });

  it('fails on alias collision across ingredients', () => {
    const r = validateSeed(
      catalog({
        ingredients: [
          baseIng({ id: 'a', name: 'A', defaultFormId: 'a-bulk', aliases: ['FOO'] }),
          baseIng({
            id: 'b',
            name: 'B',
            defaultFormId: 'b-bulk',
            aliases: ['foo'],
          }),
        ],
        forms: [
          baseForm({ id: 'a-bulk', ingredientId: 'a' }),
          baseForm({ id: 'b-bulk', ingredientId: 'b' }),
        ],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'alias_collision')).toBe(true);
  });

  it('fails when both directions of an edge pair exist', () => {
    const forms: IngredientForm[] = [
      baseForm({ id: 'a-x', ingredientId: 'test-ing', form: 'x' }),
      baseForm({ id: 'a-y', ingredientId: 'test-ing', form: 'y' }),
    ];
    const edges: ConversionEdge[] = [
      {
        fromFormId: 'a-x',
        toFormId: 'a-y',
        factor: 2,
        uncertaintyPct: 5,
        source: 'seed',
      },
      {
        fromFormId: 'a-y',
        toFormId: 'a-x',
        factor: 0.5,
        uncertaintyPct: 5,
        source: 'seed',
      },
    ];
    const r = validateSeed(
      catalog({
        ingredients: [baseIng({ defaultFormId: 'a-x' })],
        forms,
        edges,
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'duplicate_direction_edge')).toBe(
      true,
    );
  });

  it('fails density outside sane band', () => {
    const r = validateSeed(
      catalog({
        forms: [
          baseForm({
            densityGPerMl: 5.0,
          }),
        ],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'density_out_of_band')).toBe(true);
  });

  it('fails volume form without density', () => {
    const r = validateSeed(
      catalog({
        forms: [baseForm({ dim: 'volume', densityGPerMl: undefined })],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'form_missing_density')).toBe(true);
  });

  it('fails count form without gramsPerCount', () => {
    const r = validateSeed(
      catalog({
        forms: [baseForm({ dim: 'count', gramsPerCount: undefined })],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'form_missing_grams_per_count')).toBe(
      true,
    );
  });

  it('fails edge referencing unknown form', () => {
    const r = validateSeed(
      catalog({
        edges: [
          {
            fromFormId: 'test-ing-bulk',
            toFormId: 'missing',
            factor: 1,
            uncertaintyPct: 0,
            source: 'seed',
          },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'edge_unknown_form')).toBe(true);
  });

  it('undirectedEdgeKey is order-independent', () => {
    expect(undirectedEdgeKey('a', 'b')).toBe(undirectedEdgeKey('b', 'a'));
    expect(undirectedEdgeKey('a', 'b')).not.toBe(undirectedEdgeKey('a', 'c'));
  });

  it('normalizeAlias collapses case and whitespace', () => {
    expect(normalizeAlias('  SHRD  CHDR ')).toBe('shrd chdr');
  });
});
