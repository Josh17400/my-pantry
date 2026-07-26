/**
 * Build import review state: match lines + locale ambiguities.
 */

import { parseQuantity } from '@larder/core';

import {
  matchFreeTextLine,
  toRecipeLineInput,
} from '../community/match-lines';
import type { MatchCatalog } from '../community/core-imports';
import type { ImportProvenance } from '../community/types';
import type { RecipeLineInput, RecipeStepInput, RecipeWrite } from '../../db/types';
import {
  detectSourceLocale,
  findLocaleAmbiguities,
  needsLocalePrompt,
} from './locale';
import type {
  ExtractedRecipe,
  ImportReviewLine,
  ImportReviewState,
  ImportSaveBlock,
  LocaleChoice,
} from './types';

export function buildImportReview(
  extracted: ExtractedRecipe,
  catalog: MatchCatalog,
  options: {
    source: ImportReviewState['source'];
    sourceUrl?: string | null;
    householdId?: string;
    now?: string;
  },
): ImportReviewState {
  const sourceUrl = options.sourceUrl ?? extracted.sourceUrl;
  const ambiguities = findLocaleAmbiguities(extracted.ingredients);
  const localeDetection = detectSourceLocale(extracted, sourceUrl);

  const lines: ImportReviewLine[] = extracted.ingredients.map((raw) => {
    const matched = matchFreeTextLine(raw, {
      catalog,
      path: 'import',
      householdId: options.householdId,
    });
    const parsed = parseQuantity(raw);
    const ambiguousLocale =
      parsed.kind === 'quantity' ? parsed.ambiguousLocale : false;
    const unitToken =
      parsed.kind === 'quantity' ? String(parsed.unit) : null;

    return {
      ...matched,
      originalRaw: raw,
      ambiguousLocale,
      unitToken,
    };
  });

  const provenance: ImportProvenance = {
    sourceUrl: sourceUrl ?? 'manual',
    importedAt: options.now ?? new Date().toISOString(),
    stepsRewritten: false,
  };

  return {
    extracted,
    source: options.source,
    sourceUrl,
    lines,
    localeDetection,
    localeChoice: null,
    ambiguousLines: ambiguities,
    provenance,
  };
}

export function setLocaleChoice(
  state: ImportReviewState,
  choice: LocaleChoice,
): ImportReviewState {
  return { ...state, localeChoice: choice };
}

export function canSaveImport(state: ImportReviewState): ImportSaveBlock {
  if (!state.extracted.name.trim()) {
    return {
      blocked: true,
      code: 'no_title',
      message: 'Add a recipe title before saving.',
    };
  }
  if (state.lines.length === 0) {
    return {
      blocked: true,
      code: 'no_ingredients',
      message: 'Add at least one ingredient before saving.',
    };
  }
  if (needsLocalePrompt(state.ambiguousLines, state.localeChoice)) {
    return {
      blocked: true,
      code: 'locale_unresolved',
      message:
        'Choose US or Imperial for ambiguous units (pint, cup, etc.) before saving. We will not guess.',
    };
  }
  return { blocked: false };
}

/**
 * Map review state → RecipeWrite for the user's private book.
 * Never sets visibility public. Tags include import provenance marker.
 */
export function reviewToRecipeWrite(
  state: ImportReviewState,
  options: {
    id: string;
    householdId: string;
    authorId?: string | null;
  },
): RecipeWrite {
  const ingredients: RecipeLineInput[] = state.lines.map(toRecipeLineInput);
  const steps: RecipeStepInput[] = state.extracted.steps.map((text) => ({
    text,
  }));

  const tags = [
    ...state.extracted.keywords,
    'imported',
  ];
  if (state.localeChoice) {
    tags.push(`locale:${state.localeChoice}`);
  }
  if (state.sourceUrl) {
    tags.push('has-source-url');
  }

  return {
    id: options.id,
    householdId: options.householdId,
    title: state.extracted.name,
    servings: state.extracted.servings ?? 4,
    yieldNote: null,
    prepMin: state.extracted.prepMin,
    cookMin: state.extracted.cookMin,
    authorId: options.authorId ?? null,
    visibility: 'private',
    forkedFrom: null,
    tags: [...new Set(tags.map((t) => t.toLowerCase()))],
    imageUrl: state.extracted.imageUrl,
    ingredients,
    steps,
  };
}

/** Count resolved vs unresolved for the review UI honesty banner. */
export function matchSummary(state: ImportReviewState): {
  readonly resolved: number;
  readonly unresolved: number;
  readonly total: number;
  readonly label: string;
} {
  const resolved = state.lines.filter((l) => l.matched).length;
  const total = state.lines.length;
  const unresolved = total - resolved;
  return {
    resolved,
    unresolved,
    total,
    label:
      unresolved === 0
        ? `All ${total} ingredients matched the catalog`
        : `Matched ${resolved} of ${total} ingredients · ${unresolved} keep unknown allergens`,
  };
}
