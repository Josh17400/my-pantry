/**
 * Community recipes — browse, publish, fork, moderate.
 * Shapes sit on top of app-layer RecipeDetail / RecipeSummary.
 */

import type { RecipeDetail, RecipeLineInput, RecipeStepInput, RecipeVisibility } from '../../db/types';

export type CommunitySearchFilters = {
  /** Free-text over title, tags, ingredient rawText. */
  readonly query?: string;
  /** Match recipes that list this ingredient id or raw text substring. */
  readonly ingredient?: string;
  /** Match any of these tags (case-insensitive). */
  readonly tags?: readonly string[];
  /** Max total prep+cook minutes (inclusive). Null/undefined = no cap. */
  readonly maxTotalMin?: number | null;
  /** Min total minutes. */
  readonly minTotalMin?: number | null;
};

export type CommunityRecipeCard = {
  readonly id: string;
  readonly title: string;
  readonly servings: number;
  readonly prepMin: number | null;
  readonly cookMin: number | null;
  readonly totalMin: number | null;
  readonly tags: readonly string[];
  readonly imageUrl: string | null;
  readonly authorId: string | null;
  readonly authorDisplayName: string | null;
  readonly forkedFrom: string | null;
  readonly updatedAt: string;
  /** True when any line has unknownAllergens. */
  readonly hasUnknownAllergens: boolean;
};

export type AuthorProfile = {
  readonly authorId: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly publicRecipeCount: number;
  readonly memberSince: string | null;
};

export type ReportReason =
  | 'spam'
  | 'copyright'
  | 'unsafe'
  | 'offensive'
  | 'misinformation'
  | 'other';

export type RecipeReport = {
  readonly id: string;
  readonly recipeId: string;
  readonly reporterId: string;
  readonly reason: ReportReason;
  readonly details: string | null;
  readonly createdAt: string;
  readonly status: 'open' | 'reviewed' | 'dismissed';
};

export type CreateReportInput = {
  readonly recipeId: string;
  readonly reporterId: string;
  readonly reason: ReportReason;
  readonly details?: string | null;
  readonly now?: string;
};

export type PublishResult =
  | { readonly ok: true; readonly visibility: 'public' }
  | {
      readonly ok: false;
      readonly code:
        | 'rate_limited'
        | 'imported_source'
        | 'unknown_allergens_block'
        | 'not_author'
        | 'already_public';
      readonly message: string;
      readonly retryAfterMs?: number;
    };

export type ForkInput = {
  readonly source: RecipeDetail;
  readonly newId: string;
  readonly householdId: string;
  readonly authorId: string | null;
  /** Optional title override; default "Title (copy)". */
  readonly title?: string;
};

export type ForkedRecipeWrite = {
  readonly id: string;
  readonly householdId: string;
  readonly title: string;
  readonly servings: number;
  readonly yieldNote: string | null;
  readonly prepMin: number | null;
  readonly cookMin: number | null;
  readonly authorId: string | null;
  readonly visibility: RecipeVisibility;
  readonly forkedFrom: string;
  readonly tags: readonly string[];
  readonly imageUrl: string | null;
  readonly ingredients: readonly RecipeLineInput[];
  readonly steps: readonly RecipeStepInput[];
};

/** Provenance tag for recipes imported from a URL (copyright gate). */
export type ImportProvenance = {
  readonly sourceUrl: string;
  readonly importedAt: string;
  /** Steps rewritten by user — clears publish block. */
  readonly stepsRewritten?: boolean;
};

export type MatchedIngredientLine = RecipeLineInput & {
  readonly matched: boolean;
  readonly matchConfidence: number | null;
  readonly matchStep: string | null;
};
