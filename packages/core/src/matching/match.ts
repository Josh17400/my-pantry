/**
 * Matching cascade: user alias → global alias → normalized → fuzzy →
 * needs-llm → needs-user.
 *
 * Guards (non-negotiable):
 * - Sibling exclusion: co-hyponyms never auto-accept from fuzzy
 * - Receipt path: fuzzy never auto-accepts
 * - Allergen veto: disagreeing / unknown tags block auto-accept
 * - No automatic global promotion (see promote.ts)
 *
 * Tie-breaks (deterministic): higher confidence first; then lexicographic
 * ingredient id; then lexicographic name.
 */

import {
  type AllergenTags,
  canAutoMergeAllergens,
  canAutoMergeDietaryFlags,
  type DietaryTags,
  type Ingredient,
  knownAllergens,
  knownDietaryFlags,
} from '../domain';
import { aliasKey, normalizeIngredientText } from './normalize';
import { hasSiblings } from './siblings';
import { fuzzyScore } from './string-sim';
import type {
  CascadeStep,
  IngredientAlias,
  MatchCatalog,
  MatchInput,
  MatchResult,
  MatchVeto,
  RankedCandidate,
} from './types';

/** Fuzzy must clear this to be a primary `match` (still may not auto-accept). */
export const FUZZY_CONFIDENCE_FLOOR = 0.72;

/**
 * Scores in [LLM_BAND_LOW, FUZZY_CONFIDENCE_FLOOR) → needs-llm.
 * Below LLM_BAND_LOW → needs-user.
 */
export const LLM_BAND_LOW = 0.45;

/** Second candidate within this gap of top → ambiguous (no auto-accept). */
export const AMBIGUITY_GAP = 0.05;

type IndexedIngredient = {
  ingredient: Ingredient;
  nameNormalized: string;
  nameKey: string;
};

function indexCatalog(catalog: MatchCatalog): IndexedIngredient[] {
  return catalog.ingredients.map((ingredient) => ({
    ingredient,
    nameNormalized: normalizeIngredientText(ingredient.name),
    nameKey: aliasKey(ingredient.name),
  }));
}

function byHousehold(
  aliases: readonly IngredientAlias[],
  householdId: string | undefined,
): IngredientAlias[] {
  return aliases.filter((a) => {
    if (a.scope !== 'user') return false;
    if (householdId === undefined) return true;
    return a.householdId === householdId;
  });
}

function findIngredient(
  catalog: MatchCatalog,
  id: string,
): Ingredient | undefined {
  return catalog.ingredients.find((i) => i.id === id);
}

/**
 * Safety veto: only axes present on the query are checked.
 * Omitting dietary flags must not treat the query as "no flags" vs a
 * gluten-flagged candidate (that would false-block every gluten item).
 */
function allergenVeto(
  queryAllergens: AllergenTags | undefined,
  ingredient: Ingredient,
  queryDietaryFlags?: DietaryTags,
): boolean {
  if (queryAllergens === undefined && queryDietaryFlags === undefined) {
    return false;
  }
  if (queryAllergens !== undefined) {
    const candidateAllergens = knownAllergens(ingredient.allergens);
    if (!canAutoMergeAllergens(queryAllergens, candidateAllergens)) {
      return true;
    }
  }
  if (queryDietaryFlags !== undefined) {
    const candidateDietary = knownDietaryFlags(ingredient.dietaryFlags);
    if (!canAutoMergeDietaryFlags(queryDietaryFlags, candidateDietary)) {
      return true;
    }
  }
  return false;
}

function compareCandidates(a: RankedCandidate, b: RankedCandidate): number {
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  if (a.ingredient.id !== b.ingredient.id) {
    return a.ingredient.id < b.ingredient.id ? -1 : 1;
  }
  return a.ingredient.name < b.ingredient.name
    ? -1
    : a.ingredient.name > b.ingredient.name
      ? 1
      : 0;
}

function sortCandidates(xs: RankedCandidate[]): RankedCandidate[] {
  return [...xs].sort(compareCandidates);
}

/**
 * Residual tokens allowed when a shorter ingredient name is contained in a
 * longer receipt string ("rice long grain" → rice). Typos like "hevy" are NOT
 * filler — those fall through to fuzzy + sibling exclusion.
 */
const CONTAINMENT_FILLER = new Set([
  'long',
  'grain',
  'short',
  'medium',
  'yellow',
  'white',
  'red',
  'green',
  'brown',
  'black',
  'thick',
  'thin',
  'cut',
  'sliced',
  'diced',
  'whole',
  'boneless',
  'skinless',
  'fresh',
  'frozen',
  'canned',
  'dried',
  'raw',
  'cooked',
  'plain',
  'greek',
  'bulb',
  'bunch',
  'bag',
  'box',
  'can',
  'jar',
  'bottle',
  'local',
  'extra',
  'virgin',
  'pure',
  'free',
  'range',
  'grade',
]);

/**
 * True when `phrase` appears as a contiguous whole-token sequence inside `text`
 * and every residual token is known filler (or there are none).
 * "rice" ∈ "rice long grain"; "cream" ∉ "hevy cream" (hevy is not filler).
 */
function containsPhrase(text: string, phrase: string): boolean {
  if (phrase.length === 0) return false;
  if (text === phrase) return true;
  const textToks = text.split(' ').filter(Boolean);
  const phraseToks = phrase.split(' ').filter(Boolean);
  if (phraseToks.length === 0 || phraseToks.length > textToks.length) {
    return false;
  }
  for (let i = 0; i <= textToks.length - phraseToks.length; i++) {
    let ok = true;
    for (let j = 0; j < phraseToks.length; j++) {
      if (textToks[i + j] !== phraseToks[j]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const residual = [
      ...textToks.slice(0, i),
      ...textToks.slice(i + phraseToks.length),
    ];
    if (residual.every((t) => CONTAINMENT_FILLER.has(t))) return true;
  }
  return false;
}

function exactAliasHit(
  rawKey: string,
  aliases: readonly IngredientAlias[],
  catalog: MatchCatalog,
  step: 'user-alias' | 'global-alias',
): RankedCandidate | null {
  for (const a of aliases) {
    if (aliasKey(a.alias) === rawKey) {
      const ingredient = findIngredient(catalog, a.ingredientId);
      if (ingredient === undefined) continue;
      return {
        ingredient,
        confidence: 1,
        step,
        vetoes: [],
      };
    }
  }
  return null;
}

function applyVetoes(
  candidate: RankedCandidate,
  input: {
    path: MatchInput['path'];
    queryAllergens?: AllergenTags;
    queryDietaryFlags?: DietaryTags;
    catalog: MatchCatalog;
    indexed: IndexedIngredient[];
    step: CascadeStep;
    ambiguous: boolean;
  },
): { vetoes: MatchVeto[]; autoAccept: boolean } {
  const vetoes: MatchVeto[] = [...candidate.vetoes];

  if (
    allergenVeto(
      input.queryAllergens,
      candidate.ingredient,
      input.queryDietaryFlags,
    )
  ) {
    if (!vetoes.includes('allergen')) vetoes.push('allergen');
  }

  const isFuzzy = input.step === 'fuzzy';
  if (isFuzzy && input.path === 'receipt') {
    if (!vetoes.includes('receipt-fuzzy')) vetoes.push('receipt-fuzzy');
  }

  if (isFuzzy) {
    const nameNorm =
      input.indexed.find((x) => x.ingredient.id === candidate.ingredient.id)
        ?.nameNormalized ?? normalizeIngredientText(candidate.ingredient.name);
    const sibling = hasSiblings(
      candidate.ingredient.id,
      nameNorm,
      input.indexed.map((x) => ({
        id: x.ingredient.id,
        nameNormalized: x.nameNormalized,
      })),
      input.catalog.taxonomyParentByIngredientId,
    );
    if (sibling && !vetoes.includes('sibling-exclusion')) {
      vetoes.push('sibling-exclusion');
    }
  }

  if (input.ambiguous && !vetoes.includes('ambiguous')) {
    vetoes.push('ambiguous');
  }

  if (candidate.confidence < FUZZY_CONFIDENCE_FLOOR && isFuzzy) {
    if (!vetoes.includes('below-floor')) vetoes.push('below-floor');
  }

  // Auto-accept only for exact/learned/global/normalized exact, no vetoes.
  const autoEligibleSteps: CascadeStep[] = [
    'user-alias',
    'global-alias',
    'normalized',
  ];
  const autoAccept =
    autoEligibleSteps.includes(input.step) &&
    candidate.confidence >= 1 &&
    vetoes.length === 0;

  return { vetoes, autoAccept };
}

/**
 * Match a raw string to a canonical ingredient.
 * Pure; deterministic ranking; never mutates catalog or pantry.
 */
export function matchIngredient(input: MatchInput): MatchResult {
  const raw = input.raw;
  if (raw.trim().length === 0) {
    return { kind: 'no-match', reason: 'empty query' };
  }
  if (input.catalog.ingredients.length === 0) {
    return { kind: 'no-match', reason: 'empty catalog' };
  }

  const path = input.path ?? 'general';
  const maxAlternates = input.maxAlternates ?? 5;
  const indexed = indexCatalog(input.catalog);
  const rawKey = aliasKey(raw);
  const normalized = normalizeIngredientText(raw);

  // ── 1. User-learned alias (exact on alias key) ───────────────────────────
  const userAliases = byHousehold(
    input.catalog.userAliases,
    input.householdId,
  );
  const userHit = exactAliasHit(rawKey, userAliases, input.catalog, 'user-alias');
  if (userHit !== null) {
    const { vetoes, autoAccept } = applyVetoes(userHit, {
      path,
      queryAllergens: input.queryAllergens,
      queryDietaryFlags: input.queryDietaryFlags,
      catalog: input.catalog,
      indexed,
      step: 'user-alias',
      ambiguous: false,
    });
    return {
      kind: 'match',
      ingredient: userHit.ingredient,
      confidence: userHit.confidence,
      step: 'user-alias',
      autoAccept,
      vetoes,
      alternates: [],
    };
  }

  // ── 2. Global alias (exact) ──────────────────────────────────────────────
  const globalHit = exactAliasHit(
    rawKey,
    input.catalog.globalAliases.filter((a) => a.scope === 'global'),
    input.catalog,
    'global-alias',
  );
  if (globalHit !== null) {
    const { vetoes, autoAccept } = applyVetoes(globalHit, {
      path,
      queryAllergens: input.queryAllergens,
      queryDietaryFlags: input.queryDietaryFlags,
      catalog: input.catalog,
      indexed,
      step: 'global-alias',
      ambiguous: false,
    });
    return {
      kind: 'match',
      ingredient: globalHit.ingredient,
      confidence: globalHit.confidence,
      step: 'global-alias',
      autoAccept,
      vetoes,
      alternates: [],
    };
  }

  // ── 3. Normalized exact / whole-phrase containment ───────────────────────
  // Exact name match, or longest ingredient name that appears as a contiguous
  // token sequence in the query ("rice long grain" → rice; "heavy cream" →
  // heavy cream, not plain cream — longest wins).
  if (normalized.length > 0) {
    const exactHits = indexed.filter(
      (x) =>
        x.nameNormalized === normalized ||
        x.nameKey === rawKey ||
        aliasKey(x.ingredient.name) === normalized,
    );

    let normHits = exactHits;
    if (normHits.length === 0) {
      const contained = indexed.filter(
        (x) =>
          x.nameNormalized.length > 0 &&
          containsPhrase(normalized, x.nameNormalized),
      );
      if (contained.length > 0) {
        const maxLen = Math.max(
          ...contained.map((x) => x.nameNormalized.length),
        );
        // Longest phrase only — drops shorter co-hyponyms ("cream" under "heavy cream")
        normHits = contained.filter((x) => x.nameNormalized.length === maxLen);
      }
    }

    if (normHits.length === 1) {
      const hit: RankedCandidate = {
        ingredient: normHits[0]!.ingredient,
        confidence: 1,
        step: 'normalized',
        vetoes: [],
      };
      const { vetoes, autoAccept } = applyVetoes(hit, {
        path,
        queryAllergens: input.queryAllergens,
      queryDietaryFlags: input.queryDietaryFlags,
        catalog: input.catalog,
        indexed,
        step: 'normalized',
        ambiguous: false,
      });
      return {
        kind: 'match',
        ingredient: hit.ingredient,
        confidence: 1,
        step: 'normalized',
        autoAccept,
        vetoes,
        alternates: [],
      };
    }
    if (normHits.length > 1) {
      // Ambiguous normalized (duplicate names or equal-length phrases) → user
      const candidates = sortCandidates(
        normHits.map((h) => ({
          ingredient: h.ingredient,
          confidence: 1,
          step: 'normalized' as const,
          vetoes: ['ambiguous' as const],
        })),
      );
      return {
        kind: 'needs-user',
        step: 'needs-user',
        candidates: candidates.slice(0, maxAlternates),
        reason: 'multiple ingredients share the normalized name',
      };
    }
  }

  // ── 4. Fuzzy (trigram + Levenshtein) ─────────────────────────────────────
  const queryForFuzzy = normalized.length > 0 ? normalized : rawKey;
  const fuzzyRaw: RankedCandidate[] = [];
  for (const row of indexed) {
    const against =
      row.nameNormalized.length > 0 ? row.nameNormalized : row.nameKey;
    const score = fuzzyScore(queryForFuzzy, against);
    if (score >= LLM_BAND_LOW) {
      fuzzyRaw.push({
        ingredient: row.ingredient,
        confidence: score,
        step: 'fuzzy',
        vetoes: [],
      });
    }
  }
  const fuzzySorted = sortCandidates(fuzzyRaw);

  if (fuzzySorted.length === 0) {
    return {
      kind: 'needs-user',
      step: 'needs-user',
      candidates: [],
      reason: 'no candidates above LLM band',
    };
  }

  const top = fuzzySorted[0]!;
  const second = fuzzySorted[1];
  const ambiguous =
    second !== undefined && top.confidence - second.confidence < AMBIGUITY_GAP;

  // Below fuzzy floor but in LLM band
  if (top.confidence < FUZZY_CONFIDENCE_FLOOR) {
    const candidates = fuzzySorted.slice(0, maxAlternates).map((c) => {
      const { vetoes } = applyVetoes(c, {
        path,
        queryAllergens: input.queryAllergens,
      queryDietaryFlags: input.queryDietaryFlags,
        catalog: input.catalog,
        indexed,
        step: 'fuzzy',
        ambiguous,
      });
      return { ...c, vetoes };
    });
    return {
      kind: 'needs-llm',
      step: 'needs-llm',
      confidence: top.confidence,
      candidates,
      reason: `best fuzzy ${top.confidence.toFixed(3)} below floor ${FUZZY_CONFIDENCE_FLOOR}`,
    };
  }

  // At/above floor — match with guards (may not auto-accept)
  const { vetoes, autoAccept } = applyVetoes(top, {
    path,
    queryAllergens: input.queryAllergens,
    queryDietaryFlags: input.queryDietaryFlags,
    catalog: input.catalog,
    indexed,
    step: 'fuzzy',
    ambiguous,
  });

  // Fuzzy never auto-accepts regardless of path (spec: high-confidence
  // auto-accept limited to exact / learned / global-exact; normalized exact
  // is also allowed above). Explicit second line of defense:
  const fuzzyAuto = false;

  const alternates = fuzzySorted
    .slice(1, maxAlternates + 1)
    .map((c) => {
      const v = applyVetoes(c, {
        path,
        queryAllergens: input.queryAllergens,
      queryDietaryFlags: input.queryDietaryFlags,
        catalog: input.catalog,
        indexed,
        step: 'fuzzy',
        ambiguous: false,
      });
      return { ...c, vetoes: v.vetoes };
    });

  return {
    kind: 'match',
    ingredient: top.ingredient,
    confidence: top.confidence,
    step: 'fuzzy',
    autoAccept: fuzzyAuto && autoAccept, // always false
    vetoes:
      path === 'receipt' && !vetoes.includes('receipt-fuzzy')
        ? [...vetoes, 'receipt-fuzzy']
        : vetoes,
    alternates,
  };
}

/**
 * Convenience: whether a result is safe for silent accept.
 * Prefer reading `result.autoAccept` on `kind === 'match'`.
 */
export function isAutoAccept(result: MatchResult): boolean {
  return result.kind === 'match' && result.autoAccept;
}
