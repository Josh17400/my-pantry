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
  matchIngredient,
  isAutoAccept,
} from '../../../../../packages/core/src/matching/index.ts';

export {
  seedForms,
  seedIngredients,
  type SeedIngredient,
} from '../../../../../packages/core/src/seed/index.ts';
