/**
 * Author profile — derived from public recipes + optional display metadata.
 */

import type { RecipeDetail } from '../../db/types';
import type { AuthorProfile } from './types';

export type AuthorDisplayMeta = {
  readonly authorId: string;
  readonly displayName: string;
  readonly bio?: string | null;
  readonly memberSince?: string | null;
};

/**
 * Build an author profile from public recipes attributed to authorId.
 */
export function buildAuthorProfile(
  authorId: string,
  publicRecipes: readonly RecipeDetail[],
  meta?: AuthorDisplayMeta | null,
): AuthorProfile {
  const owned = publicRecipes.filter(
    (r) => r.authorId === authorId && r.visibility === 'public',
  );
  const earliest = owned.reduce<string | null>((acc, r) => {
    if (!acc) return r.createdAt;
    return r.createdAt < acc ? r.createdAt : acc;
  }, null);

  return {
    authorId,
    displayName:
      meta?.displayName?.trim() ||
      (authorId.length > 8 ? `Cook ${authorId.slice(0, 8)}` : `Cook ${authorId}`),
    bio: meta?.bio ?? null,
    publicRecipeCount: owned.length,
    memberSince: meta?.memberSince ?? earliest,
  };
}

/** Short label for cards when full profile is not loaded. */
export function authorDisplayLabel(
  authorId: string | null,
  displayName: string | null = null,
): string {
  if (displayName?.trim()) return displayName.trim();
  if (!authorId) return 'Community cook';
  if (authorId.length <= 8) return `Cook ${authorId}`;
  return `Cook ${authorId.slice(0, 8)}`;
}
