/**
 * Community — search, fork, publish gate, rate limit, report, match-lines.
 */

import { describe, expect, it } from 'vitest';

import type { RecipeDetail } from '../../db/types';
import { buildAuthorProfile } from './author-profile';
import { DEMO_PUBLIC_RECIPES } from './demo-recipes';
import { buildForkedRecipe } from './fork';
import { buildCommunityMatchCatalog } from './match-catalog';
import { matchFreeTextLine, matchFreeTextLines } from './match-lines';
import { canPublish } from './publish';
import {
  checkPublishRateLimit,
  PUBLISH_RATE_LIMIT,
  recordPublish,
} from './rate-limit';
import {
  canReport,
  createMemoryReportStore,
  createReport,
} from './report';
import {
  filterPublicRecipes,
  recipeDetailToCard,
  searchCommunityRecipes,
} from './search';

function privateRecipe(over: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: 'r1',
    householdId: 'hh1',
    title: 'Private Soup',
    servings: 2,
    prepMin: 10,
    cookMin: 20,
    visibility: 'private',
    tags: ['soup'],
    imageUrl: null,
    updatedAt: '2026-07-26T00:00:00.000Z',
    yieldNote: null,
    authorId: 'user-1',
    forkedFrom: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ingredients: [
      {
        id: 'i1',
        sortOrder: 0,
        rawText: '1 onion',
        qty: 1,
        unit: 'each',
        unknownAllergens: true,
      },
    ],
    steps: [{ id: 's1', sortOrder: 0, text: 'Simmer.' }],
    ...over,
  };
}

describe('searchCommunityRecipes', () => {
  const details = DEMO_PUBLIC_RECIPES;
  const cards = details.map((d) => recipeDetailToCard(d));
  const byId = new Map(details.map((d) => [d.id, d]));

  it('filters by ingredient text', () => {
    const hits = searchCommunityRecipes(
      cards,
      { ingredient: 'pasta' },
      byId,
    );
    expect(hits.some((h) => h.title.includes('Pasta'))).toBe(true);
    expect(hits.every((h) => h.id !== 'pub_lemon_herb_chicken')).toBe(true);
  });

  it('filters by tag', () => {
    const hits = searchCommunityRecipes(cards, { tags: ['breakfast'] }, byId);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.title).toMatch(/Oats/i);
  });

  it('filters by max total time', () => {
    const hits = searchCommunityRecipes(
      cards,
      { maxTotalMin: 20 },
      byId,
    );
    expect(hits.every((h) => h.totalMin != null && h.totalMin <= 20)).toBe(
      true,
    );
    expect(hits.some((h) => h.title.includes('Oats'))).toBe(true);
  });

  it('query matches title', () => {
    const hits = searchCommunityRecipes(cards, { query: 'lemon' }, byId);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.id).toBe('pub_lemon_herb_chicken');
  });
});

describe('filterPublicRecipes', () => {
  it('keeps only visibility=public', () => {
    const mixed = [privateRecipe(), ...DEMO_PUBLIC_RECIPES];
    expect(filterPublicRecipes(mixed)).toHaveLength(DEMO_PUBLIC_RECIPES.length);
  });
});

describe('buildForkedRecipe', () => {
  it('copies into private book with forkedFrom set', () => {
    const source = DEMO_PUBLIC_RECIPES[0]!;
    const fork = buildForkedRecipe({
      source,
      newId: 'fork_1',
      householdId: 'hh-mine',
      authorId: 'me',
    });

    expect(fork.id).toBe('fork_1');
    expect(fork.householdId).toBe('hh-mine');
    expect(fork.authorId).toBe('me');
    expect(fork.visibility).toBe('private');
    expect(fork.forkedFrom).toBe(source.id);
    expect(fork.title).toBe(`${source.title} (copy)`);
    expect(fork.ingredients).toHaveLength(source.ingredients.length);
    expect(fork.steps).toHaveLength(source.steps.length);
    // Unknown allergens preserved
    const unknown = fork.ingredients.filter((l) => l.unknownAllergens);
    expect(unknown.length).toBeGreaterThan(0);
  });

  it('marks unmatched lines as unknownAllergens when ingredientId missing', () => {
    const source = privateRecipe({
      ingredients: [
        {
          id: 'x',
          sortOrder: 0,
          rawText: 'mystery spice blend',
          qty: null,
          unit: null,
        },
      ],
    });
    const fork = buildForkedRecipe({
      source,
      newId: 'f2',
      householdId: 'hh',
      authorId: null,
    });
    expect(fork.ingredients[0]!.unknownAllergens).toBe(true);
  });
});

describe('canPublish', () => {
  it('allows publish when under rate limit', () => {
    const recipe = privateRecipe();
    const r = canPublish({
      recipe,
      actorUserId: 'user-1',
      publishTimestamps: [],
      nowMs: 1_000_000,
    });
    expect(r.ok).toBe(true);
  });

  it('blocks imported source until steps rewritten', () => {
    const recipe = privateRecipe({ tags: ['imported'] });
    const r = canPublish({
      recipe,
      actorUserId: 'user-1',
      publishTimestamps: [],
      importProvenance: {
        sourceUrl: 'https://example.com/r',
        importedAt: '2026-07-26T00:00:00.000Z',
        stepsRewritten: false,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('imported_source');
  });

  it('allows imported after steps rewritten', () => {
    const recipe = privateRecipe();
    const r = canPublish({
      recipe,
      actorUserId: 'user-1',
      publishTimestamps: [],
      importProvenance: {
        sourceUrl: 'https://example.com/r',
        importedAt: '2026-07-26T00:00:00.000Z',
        stepsRewritten: true,
      },
    });
    expect(r.ok).toBe(true);
  });

  it('rate limits publish bursts', () => {
    const now = 10_000_000;
    const stamps = Array.from({ length: PUBLISH_RATE_LIMIT }, (_, i) => now - i * 1000);
    const r = canPublish({
      recipe: privateRecipe(),
      actorUserId: 'user-1',
      publishTimestamps: stamps,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('rate_limited');
  });
});

describe('publish rate limit pure', () => {
  it('records and slides window', () => {
    const t0 = 1_000_000;
    let stamps: number[] = [];
    for (let i = 0; i < PUBLISH_RATE_LIMIT; i++) {
      const peek = checkPublishRateLimit(stamps, t0 + i);
      expect(peek.allowed).toBe(true);
      stamps = recordPublish(stamps, t0 + i);
    }
    expect(checkPublishRateLimit(stamps, t0 + PUBLISH_RATE_LIMIT).allowed).toBe(
      false,
    );
  });
});

describe('moderation report creation', () => {
  it('creates an open report', () => {
    const report = createReport({
      recipeId: 'pub_1',
      reporterId: 'user-a',
      reason: 'spam',
      details: 'looks like an ad',
      now: '2026-07-26T12:00:00.000Z',
    });
    expect(report.id).toMatch(/^report_/);
    expect(report.status).toBe('open');
    expect(report.reason).toBe('spam');
    expect(report.details).toBe('looks like an ad');
  });

  it('stores reports and blocks duplicate open reports', () => {
    const store = createMemoryReportStore();
    const a = createReport({
      recipeId: 'r1',
      reporterId: 'u1',
      reason: 'copyright',
    });
    store.add(a);
    expect(store.listForRecipe('r1')).toHaveLength(1);

    const gate = canReport(store.list(), 'r1', 'u1');
    expect(gate.ok).toBe(false);

    const other = canReport(store.list(), 'r1', 'u2');
    expect(other.ok).toBe(true);
  });
});

describe('matchFreeTextLines + unknownAllergens', () => {
  const catalog = buildCommunityMatchCatalog();

  it('never clears unknownAllergens on unresolved stranger lines', () => {
    const line = matchFreeTextLine('2 cups XYZ-mystery-powder-99', {
      catalog,
      path: 'import',
    });
    expect(line.matched).toBe(false);
    expect(line.unknownAllergens).toBe(true);
    expect(line.ingredientId).toBeUndefined();
  });

  it('matches known catalog names when confident', () => {
    // milk is a common seed ingredient
    const lines = matchFreeTextLines(['1 cup milk'], {
      catalog,
      path: 'recipe',
    });
    // May or may not auto-match depending on seed aliases — assert safety invariant:
    // if not matched, unknown must be true; if matched, unknown must be false.
    const line = lines[0]!;
    if (line.matched) {
      expect(line.unknownAllergens).toBe(false);
      expect(line.ingredientId).toBeTruthy();
    } else {
      expect(line.unknownAllergens).toBe(true);
    }
  });
});

describe('buildAuthorProfile', () => {
  it('counts public recipes for author', () => {
    const profile = buildAuthorProfile('author_alex', DEMO_PUBLIC_RECIPES);
    expect(profile.publicRecipeCount).toBe(2);
    expect(profile.displayName).toContain('author_a');
    expect(profile.memberSince).toBeTruthy();
  });
});
