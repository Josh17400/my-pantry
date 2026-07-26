/**
 * Publish / unpublish community recipes.
 * Rate limits + copyright gate for imported-with-source recipes.
 */

import type { RecipeDetail } from '../../db/types';
import {
  checkPublishRateLimit,
  type PublishRateLimitResult,
} from './rate-limit';
import type { ImportProvenance, PublishResult } from './types';

export type PublishGateInput = {
  readonly recipe: RecipeDetail;
  readonly actorUserId: string | null;
  /** Prior successful publish timestamps (ms) for this author. */
  readonly publishTimestamps: readonly number[];
  readonly nowMs?: number;
  /**
   * When the recipe was imported from a URL, provenance blocks public
   * publish until steps are rewritten (copyright).
   */
  readonly importProvenance?: ImportProvenance | null;
  /**
   * If true, refuse publish when any line has unknownAllergens.
   * Default false — community may still publish with unknown badges;
   * matching never clears them silently.
   */
  readonly blockUnknownAllergens?: boolean;
};

/**
 * Decide whether visibility may be set to public.
 * Does not write — caller updates the recipe when ok.
 */
export function canPublish(input: PublishGateInput): PublishResult {
  const {
    recipe,
    actorUserId,
    publishTimestamps,
    nowMs = Date.now(),
    importProvenance = null,
    blockUnknownAllergens = false,
  } = input;

  if (recipe.visibility === 'public') {
    return {
      ok: false,
      code: 'already_public',
      message: 'This recipe is already public.',
    };
  }

  if (
    actorUserId != null &&
    recipe.authorId != null &&
    recipe.authorId !== actorUserId
  ) {
    return {
      ok: false,
      code: 'not_author',
      message: 'Only the author can publish this recipe.',
    };
  }

  if (importProvenance && !importProvenance.stepsRewritten) {
    return {
      ok: false,
      code: 'imported_source',
      message:
        'Imported recipes cannot be published to the community while steps still match a third-party source. Rewrite the steps in your own words first, or keep the recipe private.',
    };
  }

  if (blockUnknownAllergens) {
    const unknown = recipe.ingredients.some((l) => l.unknownAllergens === true);
    if (unknown) {
      return {
        ok: false,
        code: 'unknown_allergens_block',
        message:
          'Some ingredients are unmatched (unknown allergens). Resolve them before publishing.',
      };
    }
  }

  const rate: PublishRateLimitResult = checkPublishRateLimit(
    publishTimestamps,
    nowMs,
  );
  if (!rate.allowed) {
    const mins = Math.ceil(rate.retryAfterMs / 60_000);
    return {
      ok: false,
      code: 'rate_limited',
      message: `Publish limit reached. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`,
      retryAfterMs: rate.retryAfterMs,
    };
  }

  return { ok: true, visibility: 'public' };
}

/** Build the visibility field for a successful publish. */
export function publishVisibility(): 'public' {
  return 'public';
}

export function unpublishVisibility(): 'private' {
  return 'private';
}
