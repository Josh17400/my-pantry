/**
 * Copyright stance for URL imports.
 *
 * Ingredient lists are generally not copyrightable; prose, steps, and photos
 * are. Import is for the user's own book only — never auto-publish.
 * Publishing an imported-with-source recipe requires rewriting the steps.
 */

import type { RecipeDetail } from '../../db/types';
import type { ImportProvenance } from '../community/types';

export const COPYRIGHT_IMPORT_COPY =
  'Imported recipes stay in your private book. Recipe steps and photos from other sites are copyrighted — we never auto-publish them to the community.';

export const COPYRIGHT_PUBLISH_BLOCK_COPY =
  'This recipe was imported from a web source. To publish it, rewrite the steps in your own words first. Ingredient lists alone are fine; copied instructions are not.';

/**
 * Detect import provenance from tags / optional explicit record.
 * Tags written by reviewToRecipeWrite: "imported", "has-source-url".
 */
export function provenanceFromRecipe(
  recipe: RecipeDetail,
  explicit: ImportProvenance | null = null,
): ImportProvenance | null {
  if (explicit) return explicit;
  const tags = recipe.tags.map((t) => t.toLowerCase());
  const imported = tags.includes('imported') || tags.includes('has-source-url');
  if (!imported) return null;
  return {
    sourceUrl: tags.includes('has-source-url') ? 'unknown-url' : 'manual',
    importedAt: recipe.createdAt,
    stepsRewritten: tags.includes('steps-rewritten'),
  };
}

/**
 * After the user rewrites steps, mark provenance so publish may proceed.
 */
export function markStepsRewritten(
  provenance: ImportProvenance,
): ImportProvenance {
  return { ...provenance, stepsRewritten: true };
}

/** Tag to add when user confirms steps are original. */
export function stepsRewrittenTag(): string {
  return 'steps-rewritten';
}

export function isPublishBlockedByCopyright(
  provenance: ImportProvenance | null,
): boolean {
  if (!provenance) return false;
  return provenance.stepsRewritten !== true;
}
