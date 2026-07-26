/**
 * URL import — JSON-LD shapes, microdata, locale ambiguity, copyright gate.
 */

import { describe, expect, it } from 'vitest';

import type { RecipeDetail } from '../../db/types';
import { buildCommunityMatchCatalog } from '../community/match-catalog';
import { canPublish } from '../community/publish';
import {
  COPYRIGHT_IMPORT_COPY,
  isPublishBlockedByCopyright,
  provenanceFromRecipe,
} from './copyright';
import {
  extractedFromManualPaste,
  extractRecipeFromHtml,
} from './extract';
import {
  extractRecipeFromHtmlJsonLd,
  extractRecipeFromJsonLd,
  findRecipeNodes,
  parseDurationToMinutes,
  parseServings,
} from './jsonld';
import {
  detectSourceLocale,
  findLocaleAmbiguities,
  needsLocalePrompt,
} from './locale';
import {
  buildImportReview,
  canSaveImport,
  matchSummary,
  reviewToRecipeWrite,
  setLocaleChoice,
} from './match-import';

describe('parseDurationToMinutes / parseServings', () => {
  it('parses ISO-8601 durations', () => {
    expect(parseDurationToMinutes('PT1H30M')).toBe(90);
    expect(parseDurationToMinutes('PT45M')).toBe(45);
    expect(parseDurationToMinutes('PT2H')).toBe(120);
  });

  it('parses recipeYield variants', () => {
    expect(parseServings(4)).toBe(4);
    expect(parseServings('4 servings')).toBe(4);
    expect(parseServings(['Serves 6'])).toBe(6);
    expect(parseServings({ value: 8 })).toBe(8);
  });
});

describe('JSON-LD extraction — real-world shapes', () => {
  it('extracts a single Recipe object', () => {
    const json = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Simple Salad',
      recipeYield: '2',
      prepTime: 'PT10M',
      cookTime: 'PT0M',
      recipeIngredient: ['1 head lettuce', '2 tbsp olive oil'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Wash lettuce.' },
        { '@type': 'HowToStep', text: 'Dress and serve.' },
      ],
    });
    const recipe = extractRecipeFromJsonLd(json);
    expect(recipe).not.toBeNull();
    expect(recipe!.name).toBe('Simple Salad');
    expect(recipe!.servings).toBe(2);
    expect(recipe!.prepMin).toBe(10);
    expect(recipe!.ingredients).toHaveLength(2);
    expect(recipe!.steps).toHaveLength(2);
  });

  it('extracts Recipe from @graph', () => {
    const json = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Example' },
        {
          '@type': 'Recipe',
          name: 'Graph Soup',
          recipeIngredient: ['1 onion', '2 cups stock'],
          recipeInstructions: 'Simmer until soft.',
        },
      ],
    });
    const recipe = extractRecipeFromJsonLd(json, 'https://example.com/soup');
    expect(recipe).not.toBeNull();
    expect(recipe!.name).toBe('Graph Soup');
    expect(recipe!.ingredients).toContain('1 onion');
    expect(recipe!.sourceUrl).toBe('https://example.com/soup');
  });

  it('extracts Recipe from top-level array', () => {
    const json = JSON.stringify([
      { '@type': 'BreadcrumbList', itemListElement: [] },
      {
        '@type': ['Recipe', 'HowTo'],
        name: 'Array Cake',
        recipeIngredient: ['200 g flour', '2 eggs'],
        recipeInstructions: [
          {
            '@type': 'HowToSection',
            name: 'Mix',
            itemListElement: [
              { '@type': 'HowToStep', text: 'Mix flour and eggs.' },
            ],
          },
        ],
      },
    ]);
    const nodes = findRecipeNodes(JSON.parse(json));
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    const recipe = extractRecipeFromJsonLd(json);
    expect(recipe!.name).toBe('Array Cake');
    expect(recipe!.steps.some((s) => s.includes('Mix flour'))).toBe(true);
  });

  it('extracts from HTML script tags', () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      ${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        name: 'HTML Embedded',
        recipeIngredient: ['salt'],
        recipeInstructions: 'Season.',
      })}
      </script>
      </head><body></body></html>
    `;
    const recipe = extractRecipeFromHtmlJsonLd(html);
    expect(recipe!.name).toBe('HTML Embedded');
  });

  it('handles no structured data gracefully', () => {
    const result = extractRecipeFromHtml('<html><body>Just a blog post</body></html>');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('no_structured_data');
      expect(result.message.toLowerCase()).toMatch(/manual/);
    }
  });
});

describe('ambiguous-locale detection on a UK recipe', () => {
  const ukHtml = `
    <script type="application/ld+json">
    ${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Proper British Custard',
      inLanguage: 'en-GB',
      recipeCuisine: 'British',
      recipeIngredient: [
        '1 pint whole milk',
        '4 egg yolks',
        '2 oz caster sugar',
        '1 tsp vanilla',
      ],
      recipeInstructions: [
        'Heat the milk.',
        'Whisk yolks with sugar, temper, and cook until thick.',
      ],
    })}
    </script>
  `;

  it('detects Imperial locale signals and flags pint / fl-oz-ish ambiguity', () => {
    const result = extractRecipeFromHtml(
      ukHtml,
      'https://www.bbcgoodfood.com/recipes/custard',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const detection = detectSourceLocale(
      result.recipe,
      'https://www.bbcgoodfood.com/recipes/custard',
    );
    expect(detection.locale).toBe('imperial');
    expect(detection.signals.length).toBeGreaterThan(0);

    const ambiguities = findLocaleAmbiguities(result.recipe.ingredients);
    // "1 pint whole milk" must flag ambiguousLocale (US 473 vs Imperial 568)
    expect(ambiguities.some((a) => a.unit === 'pint')).toBe(true);
    // oz may map to mass oz (not ambiguous) or fl oz — pint is the critical one
    expect(needsLocalePrompt(ambiguities, null)).toBe(true);
    expect(needsLocalePrompt(ambiguities, 'imperial')).toBe(false);
  });

  it('blocks save until locale choice when ambiguous units present', () => {
    const result = extractRecipeFromHtml(
      ukHtml,
      'https://www.bbcgoodfood.com/recipes/custard',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const catalog = buildCommunityMatchCatalog();
    let review = buildImportReview(result.recipe, catalog, {
      source: 'json-ld',
      sourceUrl: 'https://www.bbcgoodfood.com/recipes/custard',
    });
    expect(review.ambiguousLines.length).toBeGreaterThan(0);

    const blocked = canSaveImport(review);
    expect(blocked.blocked).toBe(true);
    if (blocked.blocked) expect(blocked.code).toBe('locale_unresolved');

    review = setLocaleChoice(review, 'imperial');
    const ok = canSaveImport(review);
    expect(ok.blocked).toBe(false);
  });
});

describe('import review + copyright', () => {
  it('shows resolved vs unresolved match honesty', () => {
    const extracted = extractedFromManualPaste({
      name: 'Test',
      ingredientsText: '1 cup milk\n2 cups completely-fake-ingredient-zzz',
      stepsText: 'Mix.',
      sourceUrl: 'https://example.com/r',
    });
    const review = buildImportReview(extracted, buildCommunityMatchCatalog(), {
      source: 'manual',
      sourceUrl: 'https://example.com/r',
    });
    const summary = matchSummary(review);
    expect(summary.total).toBe(2);
    expect(summary.unresolved).toBeGreaterThanOrEqual(1);
    expect(summary.label).toMatch(/of 2/);
  });

  it('saves as private with import tags; never public', () => {
    const extracted = extractedFromManualPaste({
      name: 'Private Import',
      ingredientsText: '1 tsp salt',
      stepsText: 'Season.',
      sourceUrl: 'https://example.com/x',
    });
    const review = buildImportReview(extracted, buildCommunityMatchCatalog(), {
      source: 'manual',
      sourceUrl: 'https://example.com/x',
    });
    // salt / tsp — no ambiguous cup/pint required
    const write = reviewToRecipeWrite(review, {
      id: 'imp_1',
      householdId: 'hh1',
    });
    expect(write.visibility).toBe('private');
    expect(write.tags).toContain('imported');
    expect(write.tags).toContain('has-source-url');
  });

  it('blocks community publish for imported-with-source until rewrite', () => {
    expect(COPYRIGHT_IMPORT_COPY.toLowerCase()).toMatch(/private/);

    const recipe: RecipeDetail = {
      id: 'imp_1',
      householdId: 'hh1',
      title: 'Imported',
      servings: 2,
      prepMin: null,
      cookMin: null,
      visibility: 'private',
      tags: ['imported', 'has-source-url'],
      imageUrl: null,
      updatedAt: '2026-07-26T00:00:00.000Z',
      yieldNote: null,
      authorId: 'u1',
      forkedFrom: null,
      createdAt: '2026-07-26T00:00:00.000Z',
      ingredients: [],
      steps: [{ id: 's', sortOrder: 0, text: 'Copied steps.' }],
    };

    const prov = provenanceFromRecipe(recipe);
    expect(prov).not.toBeNull();
    expect(isPublishBlockedByCopyright(prov)).toBe(true);

    const gate = canPublish({
      recipe,
      actorUserId: 'u1',
      publishTimestamps: [],
      importProvenance: prov,
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe('imported_source');
  });
});
