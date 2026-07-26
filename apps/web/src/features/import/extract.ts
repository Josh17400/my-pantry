/**
 * Orchestrate JSON-LD then microdata extraction from HTML or raw JSON-LD.
 */

import { extractRecipeFromHtmlJsonLd, extractRecipeFromJsonLd } from './jsonld';
import { extractRecipeFromMicrodata } from './microdata';
import type { ExtractResult, ExtractedRecipe, ManualPasteInput } from './types';

/**
 * Extract a recipe from page HTML (JSON-LD preferred, microdata fallback).
 */
export function extractRecipeFromHtml(
  html: string,
  sourceUrl: string | null = null,
): ExtractResult {
  if (!html.trim()) {
    return {
      ok: false,
      code: 'empty',
      message: 'Nothing to parse. Paste a recipe page or enter details manually.',
    };
  }

  try {
    const fromLd = extractRecipeFromHtmlJsonLd(html, sourceUrl);
    if (fromLd && (fromLd.ingredients.length > 0 || fromLd.steps.length > 0)) {
      return { ok: true, recipe: fromLd, source: 'json-ld' };
    }

    const fromMd = extractRecipeFromMicrodata(html, sourceUrl);
    if (fromMd && (fromMd.ingredients.length > 0 || fromMd.steps.length > 0)) {
      return { ok: true, recipe: fromMd, source: 'microdata' };
    }

    // Bare JSON-LD body pasted without script tags
    if (html.trim().startsWith('{') || html.trim().startsWith('[')) {
      const bare = extractRecipeFromJsonLd(html, sourceUrl);
      if (bare && (bare.ingredients.length > 0 || bare.steps.length > 0)) {
        return { ok: true, recipe: bare, source: 'json-ld' };
      }
    }

    return {
      ok: false,
      code: 'no_structured_data',
      message:
        'No schema.org Recipe data found on this page. Paste the ingredients and steps manually instead.',
    };
  } catch (err) {
    return {
      ok: false,
      code: 'parse_error',
      message:
        err instanceof Error
          ? err.message
          : 'Failed to parse structured recipe data.',
    };
  }
}

/** Build ExtractedRecipe from manual paste fields. */
export function extractedFromManualPaste(
  input: ManualPasteInput,
): ExtractedRecipe {
  const ingredients = input.ingredientsText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const steps = input.stepsText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // strip leading "1. " numbering
    .map((l) => l.replace(/^\d+[.)]\s*/, ''));

  return {
    name: input.name.trim() || 'Imported recipe',
    description: null,
    servings: input.servings ?? null,
    prepMin: input.prepMin ?? null,
    cookMin: input.cookMin ?? null,
    totalMin:
      input.prepMin != null || input.cookMin != null
        ? (input.prepMin ?? 0) + (input.cookMin ?? 0) || null
        : null,
    ingredients,
    steps,
    imageUrl: null,
    keywords: [],
    sourceUrl: input.sourceUrl ?? null,
    recipeCuisine: null,
    recipeCategory: null,
    inLanguage: null,
  };
}
