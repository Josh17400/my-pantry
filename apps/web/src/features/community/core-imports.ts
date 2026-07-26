/**
 * Deep-import matching (root barrel does not re-export matching yet).
 */

export type {
  IngredientAlias,
  MatchCatalog,
  MatchInput,
  MatchPath,
  MatchResult,
  MatchVeto,
  RankedCandidate,
} from '../../../../../packages/core/src/matching/index.ts';
export {
  isAutoAccept,
  matchIngredient,
} from '../../../../../packages/core/src/matching/index.ts';
export {
  seedForms,
  type SeedIngredient,
  seedIngredients,
} from '../../../../../packages/core/src/seed/index.ts';
