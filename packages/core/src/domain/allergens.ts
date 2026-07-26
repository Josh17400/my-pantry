/**
 * Allergens are a safety system, not a preference field (SPEC.md).
 *
 * Matching must refuse auto-merge when tags disagree or when either side
 * carries unknownAllergens. No confidence score may override this.
 */

/** Major declarable allergens (US FALCPA + sesame). */
export const ALLERGENS = [
  'milk',
  'egg',
  'fish',
  'shellfish',
  'tree_nut',
  'peanut',
  'wheat',
  'soy',
  'sesame',
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_SET: ReadonlySet<Allergen> = new Set(ALLERGENS);

/** Type guard for free-text / seed validation. */
export function isAllergen(value: string): value is Allergen {
  return ALLERGEN_SET.has(value as Allergen);
}

/**
 * Canonical allergen payload for an ingredient or a matched recipe line.
 * `unknownAllergens: true` is required for unmatched free-text — treat as
 * unsafe, never as clear.
 */
export type AllergenTags =
  | {
      readonly unknownAllergens: false;
      readonly allergens: readonly Allergen[];
    }
  | {
      readonly unknownAllergens: true;
      /** Optional partial tags if some were guessed; still unsafe. */
      readonly allergens?: readonly Allergen[];
    };

/** Known, closed allergen list (no free-text unknowns). */
export function knownAllergens(
  allergens: readonly Allergen[] = [],
): AllergenTags {
  return { unknownAllergens: false, allergens };
}

/** Unmatched free-text — both recipe view and AI chef must treat as unsafe. */
export function unknownAllergenTags(
  partial?: readonly Allergen[],
): AllergenTags {
  return partial !== undefined
    ? { unknownAllergens: true, allergens: partial }
    : { unknownAllergens: true };
}

/**
 * True when two allergen tag sets are incompatible for auto-merge.
 *
 * Rules:
 * - Either side unknown → disagree (refuse auto-merge).
 * - Sorted unique sets differ → disagree.
 * - Identical known sets → compatible.
 */
export function allergensDisagree(a: AllergenTags, b: AllergenTags): boolean {
  if (a.unknownAllergens || b.unknownAllergens) return true;
  return !sameAllergenSet(a.allergens, b.allergens);
}

/**
 * Whether matching may auto-merge two candidates on allergen grounds alone.
 * Sibling exclusion and fuzzy confidence are separate checks.
 */
export function canAutoMergeAllergens(
  a: AllergenTags,
  b: AllergenTags,
): boolean {
  return !allergensDisagree(a, b);
}

function sameAllergenSet(
  a: readonly Allergen[],
  b: readonly Allergen[],
): boolean {
  if (a.length !== b.length) {
    // Still equal if same unique members (order / dups ignored)
    const sa = sortedUnique(a);
    const sb = sortedUnique(b);
    if (sa.length !== sb.length) return false;
    return sa.every((v, i) => v === sb[i]);
  }
  const sa = sortedUnique(a);
  const sb = sortedUnique(b);
  if (sa.length !== sb.length) return false;
  return sa.every((v, i) => v === sb[i]);
}

function sortedUnique(xs: readonly Allergen[]): Allergen[] {
  return [...new Set(xs)].sort();
}
