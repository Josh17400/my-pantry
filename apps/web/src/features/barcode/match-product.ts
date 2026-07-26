/**
 * OFF product (or free text) → matchIngredient against our catalog.
 * Results are suggestions; user confirms before purchase txn.
 */

import { matchIngredient } from '../../../../../packages/core/src/matching/index.ts';
import type { MatchResult } from '../../../../../packages/core/src/matching/types.ts';
import {
  buildSeedMatchCatalog,
  defaultFormIdForIngredient,
  getCatalogIngredientName,
} from './match-catalog';
import { offProductMatchQuery } from './segregation';
import type { IngredientMatchSuggestion, OffDerivedProduct } from './types';

export function matchOffProduct(
  product: OffDerivedProduct,
  householdId?: string,
): IngredientMatchSuggestion {
  const queryText = offProductMatchQuery(product);
  const match = matchIngredient({
    raw: queryText,
    catalog: buildSeedMatchCatalog(),
    path: 'receipt',
    householdId,
  });
  return { match, queryText, offProduct: product };
}

export function matchFreeText(
  raw: string,
  householdId?: string,
): IngredientMatchSuggestion {
  const match = matchIngredient({
    raw,
    catalog: buildSeedMatchCatalog(),
    path: 'receipt',
    householdId,
  });
  return { match, queryText: raw, offProduct: null };
}

/** Best-effort pick of ingredient id + form for UI pre-fill. */
export function suggestionDefaults(match: MatchResult): {
  ingredientId: string | null;
  formId: string | null;
  displayName: string | null;
  autoAccept: boolean;
} {
  if (match.kind === 'match') {
    return {
      ingredientId: match.ingredient.id,
      formId: match.ingredient.defaultFormId,
      displayName: match.ingredient.name,
      autoAccept: match.autoAccept,
    };
  }
  if (
    (match.kind === 'needs-user' || match.kind === 'needs-llm') &&
    match.candidates.length > 0
  ) {
    const top = match.candidates[0]!;
    return {
      ingredientId: top.ingredient.id,
      formId: top.ingredient.defaultFormId,
      displayName: top.ingredient.name,
      autoAccept: false,
    };
  }
  return {
    ingredientId: null,
    formId: null,
    displayName: null,
    autoAccept: false,
  };
}

export function resolveFormId(
  ingredientId: string,
  preferredFormId?: string | null,
): string | null {
  if (preferredFormId) return preferredFormId;
  return defaultFormIdForIngredient(ingredientId);
}

export function labelForIngredient(ingredientId: string): string {
  return getCatalogIngredientName(ingredientId);
}
