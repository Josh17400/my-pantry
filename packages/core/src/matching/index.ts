/**
 * @larder/core/matching — name → canonical ingredient cascade.
 *
 * Pure TypeScript. Zero React, zero platform APIs, zero I/O.
 * Root barrel (`src/index.ts`) is owned by another track — do not edit it.
 */

export type {
  AliasScope,
  CascadeStep,
  IngredientAlias,
  MatchCatalog,
  MatchInput,
  MatchPath,
  MatchResult,
  MatchVeto,
  PromotionCandidate,
  PromotionDecision,
  PromotionEvaluationInput,
  RankedCandidate,
} from './types';

export {
  aliasKey,
  expandAbbreviations,
  normalizeIngredientText,
  singularize,
} from './normalize';

export {
  fuzzyScore,
  levenshtein,
  levenshteinSimilarity,
  trigramSimilarity,
  trigrams,
} from './string-sim';

export {
  DEFAULT_SIBLING_FAMILIES,
  hasSiblings,
  siblingIds,
  taxonomyParentId,
} from './siblings';

export {
  AMBIGUITY_GAP,
  FUZZY_CONFIDENCE_FLOOR,
  isAutoAccept,
  LLM_BAND_LOW,
  matchIngredient,
} from './match';

export {
  createPromotionCandidate,
  evaluatePromotion,
  MAX_DISAGREEMENT_RATE,
  MIN_HOUSEHOLDS_FOR_PROMOTION,
  shouldAutoPromote,
} from './promote';
