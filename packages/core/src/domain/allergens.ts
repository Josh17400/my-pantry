/**
 * Allergens are a safety system, not a preference field (SPEC.md).
 *
 * Matching must refuse auto-merge when tags disagree or when either side
 * carries unknownAllergens. No confidence score may override this.
 *
 * Dietary flags are a separate practical axis (e.g. gluten for celiac).
 * FALCPA "wheat" is not the same question as "contains gluten" — barley and
 * rye have gluten without being wheat. Keep the axes distinct.
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
 * Practical dietary flags beyond FALCPA major allergens.
 * Used by matching vetoes and the AI chef hard gate.
 *
 * - gluten: wheat, barley, rye, spelt, farro, malt, conventional oats (x-contam),
 *   soy sauce (wheat), etc.
 * - pork / beef / alcohol: religious and preference constraints
 * - shellfish-derived: e.g. oyster sauce, shrimp paste used as seasoning
 */
export const DIETARY_FLAGS = [
  'gluten',
  'pork',
  'alcohol',
  'beef',
  'shellfish-derived',
] as const;

export type DietaryFlag = (typeof DIETARY_FLAGS)[number];

export const DIETARY_FLAG_SET: ReadonlySet<DietaryFlag> = new Set(DIETARY_FLAGS);

export function isDietaryFlag(value: string): value is DietaryFlag {
  return DIETARY_FLAG_SET.has(value as DietaryFlag);
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

/**
 * Practical dietary-flag payload. Parallel to AllergenTags so matching can
 * refuse auto-merge when flags disagree, without conflating with FALCPA.
 */
export type DietaryTags =
  | {
      readonly unknownDietaryFlags: false;
      readonly dietaryFlags: readonly DietaryFlag[];
    }
  | {
      readonly unknownDietaryFlags: true;
      readonly dietaryFlags?: readonly DietaryFlag[];
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

/** Known dietary flags (closed list). */
export function knownDietaryFlags(
  dietaryFlags: readonly DietaryFlag[] = [],
): DietaryTags {
  return { unknownDietaryFlags: false, dietaryFlags };
}

/** Unmatched free-text — chef / matching treat as unsafe for flag-sensitive users. */
export function unknownDietaryTags(
  partial?: readonly DietaryFlag[],
): DietaryTags {
  return partial !== undefined
    ? { unknownDietaryFlags: true, dietaryFlags: partial }
    : { unknownDietaryFlags: true };
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
  return !sameStringSet(a.allergens, b.allergens);
}

/**
 * True when two dietary-flag sets are incompatible for auto-merge.
 * Same rules as allergensDisagree (unknown → refuse; sets must match).
 */
export function dietaryFlagsDisagree(a: DietaryTags, b: DietaryTags): boolean {
  if (a.unknownDietaryFlags || b.unknownDietaryFlags) return true;
  return !sameStringSet(a.dietaryFlags, b.dietaryFlags);
}

/**
 * Combined safety disagree: allergen OR dietary-flag disagreement.
 * Prefer this when both axes are available.
 */
export function safetyTagsDisagree(
  allergensA: AllergenTags,
  allergensB: AllergenTags,
  dietaryA: DietaryTags = knownDietaryFlags(),
  dietaryB: DietaryTags = knownDietaryFlags(),
): boolean {
  return allergensDisagree(allergensA, allergensB) ||
    dietaryFlagsDisagree(dietaryA, dietaryB);
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

/** Whether matching may auto-merge on dietary-flag grounds alone. */
export function canAutoMergeDietaryFlags(
  a: DietaryTags,
  b: DietaryTags,
): boolean {
  return !dietaryFlagsDisagree(a, b);
}

/**
 * Full safety auto-merge gate: both allergen and dietary axes must agree.
 */
export function canAutoMergeSafety(
  allergensA: AllergenTags,
  allergensB: AllergenTags,
  dietaryA: DietaryTags = knownDietaryFlags(),
  dietaryB: DietaryTags = knownDietaryFlags(),
): boolean {
  return !safetyTagsDisagree(allergensA, allergensB, dietaryA, dietaryB);
}

/**
 * Whether a candidate ingredient is unsafe for a user avoid-list.
 * Unknown allergen / dietary tags are always unsafe when the user has any avoid.
 * Empty avoid lists → nothing is avoid-blocked (unknown still flagged for chef).
 */
export function ingredientHitsAvoidList(args: {
  readonly allergens: readonly Allergen[];
  readonly dietaryFlags: readonly DietaryFlag[];
  readonly unknownAllergens?: boolean;
  readonly unknownDietaryFlags?: boolean;
  readonly avoidAllergens: readonly Allergen[];
  readonly avoidDietaryFlags: readonly DietaryFlag[];
}): boolean {
  if (args.unknownAllergens || args.unknownDietaryFlags) {
    // Unknown is never "clear" for a safety-sensitive user.
    // If the user has no avoids, callers may still treat unknown as soft-warn.
    return (
      args.avoidAllergens.length > 0 || args.avoidDietaryFlags.length > 0
    );
  }
  const avoidA = new Set(args.avoidAllergens);
  const avoidD = new Set(args.avoidDietaryFlags);
  if (args.allergens.some((a) => avoidA.has(a))) return true;
  if (args.dietaryFlags.some((d) => avoidD.has(d))) return true;
  return false;
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  const sa = sortedUniqueStrings(a);
  const sb = sortedUniqueStrings(b);
  if (sa.length !== sb.length) return false;
  return sa.every((v, i) => v === sb[i]);
}

function sortedUniqueStrings(xs: readonly string[]): string[] {
  return [...new Set(xs)].sort();
}
