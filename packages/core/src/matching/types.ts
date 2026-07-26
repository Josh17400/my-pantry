/**
 * Ingredient matching — cascade result shapes.
 *
 * Cascade (cheapest first): user alias → global alias → normalized → fuzzy
 * → needs-llm → needs-user. This module never mutates state; the caller
 * decides auto-accept vs prompt from `autoAccept` + vetoes.
 */

import type { AllergenTags, DietaryTags, Ingredient } from '../domain';

/** Where the raw string came from — gates fuzzy auto-accept. */
export type MatchPath = 'receipt' | 'recipe' | 'import' | 'general';

/**
 * Which cascade step produced the primary outcome.
 * `needs-llm` / `needs-user` are terminal steps without a committed match.
 */
export type CascadeStep =
  | 'user-alias'
  | 'global-alias'
  | 'normalized'
  | 'fuzzy'
  | 'needs-llm'
  | 'needs-user';

/** Why auto-accept was refused (may stack). */
export type MatchVeto =
  | 'sibling-exclusion'
  | 'receipt-fuzzy'
  | 'allergen'
  | 'below-floor'
  | 'ambiguous';

export type AliasScope = 'user' | 'global';

/**
 * Alias row. User aliases stay household-scoped; global aliases are
 * server-curated. Matching never auto-promotes user → global.
 */
export type IngredientAlias = {
  readonly alias: string;
  readonly ingredientId: string;
  readonly scope: AliasScope;
  /** Required when scope === 'user'. */
  readonly householdId?: string;
};

/** Ranked alternate for UI / LLM disambiguation. */
export type RankedCandidate = {
  readonly ingredient: Ingredient;
  readonly confidence: number;
  readonly step: CascadeStep;
  readonly vetoes: readonly MatchVeto[];
};

/**
 * Discriminated match result. Never mutates pantry or alias tables.
 *
 * - `match` — a primary candidate (may still require a tap: autoAccept false)
 * - `needs-llm` — mid-band fuzzy; caller may invoke LLM (out of scope here)
 * - `needs-user` — ask the user with ranked candidates
 * - `no-match` — empty catalog or blank query
 */
export type MatchResult =
  | {
      readonly kind: 'match';
      readonly ingredient: Ingredient;
      readonly confidence: number;
      readonly step: Exclude<CascadeStep, 'needs-llm' | 'needs-user'>;
      /**
       * True only when high-confidence exact / learned / global-exact
       * (or normalized exact) and no veto applies.
       * Fuzzy is never auto-accept on the receipt path.
       */
      readonly autoAccept: boolean;
      readonly vetoes: readonly MatchVeto[];
      readonly alternates: readonly RankedCandidate[];
    }
  | {
      readonly kind: 'needs-llm';
      readonly step: 'needs-llm';
      readonly confidence: number;
      readonly candidates: readonly RankedCandidate[];
      readonly reason: string;
    }
  | {
      readonly kind: 'needs-user';
      readonly step: 'needs-user';
      readonly candidates: readonly RankedCandidate[];
      readonly reason: string;
    }
  | {
      readonly kind: 'no-match';
      readonly reason: string;
    };

/** Injected catalog — pure; no I/O. */
export type MatchCatalog = {
  readonly ingredients: readonly Ingredient[];
  /**
   * Taxonomic parent id per ingredient. Co-hyponyms sharing a parent
   * never auto-accept from fuzzy (cream family, stock/broth, …).
   */
  readonly taxonomyParentByIngredientId: Readonly<Record<string, string>>;
  readonly globalAliases: readonly IngredientAlias[];
  readonly userAliases: readonly IngredientAlias[];
};

export type MatchInput = {
  /** Raw receipt line, recipe free text, or import string. */
  readonly raw: string;
  readonly catalog: MatchCatalog;
  /** Defaults to 'general'. Receipt path blocks fuzzy auto-accept. */
  readonly path?: MatchPath;
  /**
   * Optional allergen tags on the query (e.g. partial OCR / prior knowledge).
   * When present, disagreeing or unknown tags veto auto-accept.
   */
  readonly queryAllergens?: AllergenTags;
  /**
   * Optional dietary flags on the query (gluten, pork, …).
   * Disagreeing or unknown flags veto auto-accept together with allergens.
   */
  readonly queryDietaryFlags?: DietaryTags;
  /**
   * When set, only user aliases for this household are considered
   * (plus all global aliases).
   */
  readonly householdId?: string;
  /** Max alternates to return (default 5). */
  readonly maxAlternates?: number;
};

/** Suggestion that user alias might become global — never auto-applied. */
export type PromotionCandidate = {
  readonly alias: string;
  readonly ingredientId: string;
  readonly householdId: string;
  readonly observedAt: string;
  /** Always false from this module — promotion is curation-gated. */
  readonly autoApplied: false;
};

export type PromotionEvaluationInput = {
  /** Distinct households that confirmed the same alias → ingredient. */
  readonly independentHouseholdCount: number;
  /** Human / model curation approved. */
  readonly curated: boolean;
  /** Fraction of confirmations that disagree on the target ingredient. */
  readonly disagreementRate: number;
};

export type PromotionDecision =
  | {
      readonly action: 'promote';
      readonly reasons: readonly string[];
    }
  | {
      readonly action: 'queue';
      readonly reasons: readonly string[];
      readonly needsHouseholds: number;
      readonly needsCuration: boolean;
    }
  | {
      readonly action: 'reject';
      readonly reasons: readonly string[];
    };
