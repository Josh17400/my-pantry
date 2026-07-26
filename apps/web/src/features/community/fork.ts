/**
 * Fork a public (or any readable) recipe into the user's own book.
 * Copies lines/steps; sets forkedFrom; never inherits public visibility.
 */

import type { RecipeLineInput, RecipeStepInput } from '../../db/types';
import type { ForkInput, ForkedRecipeWrite } from './types';

function copyLines(
  source: ForkInput['source']['ingredients'],
): RecipeLineInput[] {
  return source.map((line) => ({
    ingredientId: line.ingredientId,
    formId: line.formId,
    rawText: line.rawText,
    qty: line.qty,
    unit: line.unit,
    optional: line.optional,
    group: line.group,
    substitutes: line.substitutes ? [...line.substitutes] : undefined,
    // Preserve unknown allergens — never assume a stranger's recipe is clear.
    unknownAllergens: line.unknownAllergens ?? !line.ingredientId,
    nonQuantified: line.nonQuantified,
    qtyHigh: line.qtyHigh,
    qtyLow: line.qtyLow,
    isRange: line.isRange,
  }));
}

function copySteps(
  source: ForkInput['source']['steps'],
): RecipeStepInput[] {
  return source.map((s) => ({
    text: s.text,
    durationSec: s.durationSec,
    timerLabel: s.timerLabel,
  }));
}

/**
 * Build a RecipeWrite-shaped fork. Caller persists via createRecipe.
 * Visibility is always private; forkedFrom points at the source id.
 */
export function buildForkedRecipe(input: ForkInput): ForkedRecipeWrite {
  const { source, newId, householdId, authorId } = input;
  const title =
    input.title?.trim() ||
    (source.title.endsWith('(copy)')
      ? source.title
      : `${source.title} (copy)`);

  return {
    id: newId,
    householdId,
    title,
    servings: source.servings,
    yieldNote: source.yieldNote,
    prepMin: source.prepMin,
    cookMin: source.cookMin,
    authorId,
    visibility: 'private',
    forkedFrom: source.id,
    tags: [...source.tags],
    imageUrl: source.imageUrl,
    ingredients: copyLines(source.ingredients),
    steps: copySteps(source.steps),
  };
}
