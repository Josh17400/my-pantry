/**
 * Community recipe search — pure filter over public recipe cards.
 */

import type { RecipeDetail, RecipeSummary } from '../../db/types';
import type { CommunityRecipeCard, CommunitySearchFilters } from './types';

export function totalMinutes(
  prepMin: number | null | undefined,
  cookMin: number | null | undefined,
): number | null {
  const p = prepMin ?? 0;
  const c = cookMin ?? 0;
  if (p <= 0 && c <= 0) return null;
  return p + c;
}

export function recipeDetailToCard(
  detail: RecipeDetail,
  authorDisplayName: string | null = null,
): CommunityRecipeCard {
  return {
    id: detail.id,
    title: detail.title,
    servings: detail.servings,
    prepMin: detail.prepMin,
    cookMin: detail.cookMin,
    totalMin: totalMinutes(detail.prepMin, detail.cookMin),
    tags: detail.tags,
    imageUrl: detail.imageUrl,
    authorId: detail.authorId,
    authorDisplayName,
    forkedFrom: detail.forkedFrom,
    updatedAt: detail.updatedAt,
    hasUnknownAllergens: detail.ingredients.some((l) => l.unknownAllergens === true),
  };
}

export function recipeSummaryToCard(
  summary: RecipeSummary,
  extras: {
    authorId?: string | null;
    authorDisplayName?: string | null;
    forkedFrom?: string | null;
    hasUnknownAllergens?: boolean;
  } = {},
): CommunityRecipeCard {
  return {
    id: summary.id,
    title: summary.title,
    servings: summary.servings,
    prepMin: summary.prepMin,
    cookMin: summary.cookMin,
    totalMin: totalMinutes(summary.prepMin, summary.cookMin),
    tags: summary.tags,
    imageUrl: summary.imageUrl,
    authorId: extras.authorId ?? null,
    authorDisplayName: extras.authorDisplayName ?? null,
    forkedFrom: extras.forkedFrom ?? null,
    updatedAt: summary.updatedAt,
    hasUnknownAllergens: extras.hasUnknownAllergens ?? false,
  };
}

function tagHit(tags: readonly string[], wanted: readonly string[]): boolean {
  if (wanted.length === 0) return true;
  const lower = tags.map((t) => t.toLowerCase());
  return wanted.some((w) => lower.includes(w.toLowerCase()));
}

function ingredientHit(
  detail: RecipeDetail | undefined,
  ingredient: string | undefined,
): boolean {
  if (!ingredient || ingredient.trim() === '') return true;
  if (!detail) return false;
  const q = ingredient.trim().toLowerCase();
  return detail.ingredients.some((line) => {
    if (line.rawText.toLowerCase().includes(q)) return true;
    if (line.ingredientId?.toLowerCase().includes(q)) return true;
    return false;
  });
}

function queryHit(
  card: CommunityRecipeCard,
  detail: RecipeDetail | undefined,
  query: string | undefined,
): boolean {
  if (!query || query.trim() === '') return true;
  const q = query.trim().toLowerCase();
  if (card.title.toLowerCase().includes(q)) return true;
  if (card.tags.some((t) => t.toLowerCase().includes(q))) return true;
  if (detail) {
    if (
      detail.ingredients.some(
        (l) =>
          l.rawText.toLowerCase().includes(q) ||
          (l.ingredientId?.toLowerCase().includes(q) ?? false),
      )
    ) {
      return true;
    }
  }
  if (card.authorDisplayName?.toLowerCase().includes(q)) return true;
  return false;
}

function timeHit(
  totalMin: number | null,
  minTotalMin: number | null | undefined,
  maxTotalMin: number | null | undefined,
): boolean {
  if (minTotalMin != null && minTotalMin > 0) {
    if (totalMin == null || totalMin < minTotalMin) return false;
  }
  if (maxTotalMin != null && maxTotalMin > 0) {
    if (totalMin == null || totalMin > maxTotalMin) return false;
  }
  return true;
}

/**
 * Filter public community cards. Pass details map when filtering by ingredient.
 * Only cards already known to be public should be passed in.
 */
export function searchCommunityRecipes(
  cards: readonly CommunityRecipeCard[],
  filters: CommunitySearchFilters,
  detailsById: ReadonlyMap<string, RecipeDetail> = new Map(),
): CommunityRecipeCard[] {
  return cards.filter((card) => {
    const detail = detailsById.get(card.id);
    if (!queryHit(card, detail, filters.query)) return false;
    if (!ingredientHit(detail, filters.ingredient)) return false;
    if (!tagHit(card.tags, filters.tags ?? [])) return false;
    if (!timeHit(card.totalMin, filters.minTotalMin, filters.maxTotalMin)) {
      return false;
    }
    return true;
  });
}

/** Keep only public-visibility recipes. */
export function filterPublicRecipes(
  details: readonly RecipeDetail[],
): RecipeDetail[] {
  return details.filter((d) => d.visibility === 'public');
}
