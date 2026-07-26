/**
 * Global alias promotion — never automatic majority-vote.
 *
 * User aliases stay user-scoped. A promotion candidate is a *record* for a
 * curation queue; this module never writes the global table.
 */

import type {
  PromotionCandidate,
  PromotionDecision,
  PromotionEvaluationInput,
} from './types';

/**
 * Independent households required before a curated promotion may proceed.
 * Majority vote alone is a table-poisoning vector (red-team M2).
 */
export const MIN_HOUSEHOLDS_FOR_PROMOTION = 5;

/** Disagreement rate above this → reject (not merely queue). */
export const MAX_DISAGREEMENT_RATE = 0.15;

/**
 * Build a promotion *candidate* record. `autoApplied` is always false.
 */
export function createPromotionCandidate(input: {
  alias: string;
  ingredientId: string;
  householdId: string;
  /** Injected clock for tests (ISO-8601). */
  now?: () => Date;
}): PromotionCandidate {
  const now = input.now ?? (() => new Date());
  return {
    alias: input.alias,
    ingredientId: input.ingredientId,
    householdId: input.householdId,
    observedAt: now().toISOString(),
    autoApplied: false,
  };
}

/**
 * Hard rule: this module never auto-applies promotions.
 * Always returns false — use `evaluatePromotion` for the curation gate.
 */
export function shouldAutoPromote(_candidate: PromotionCandidate): false {
  return false;
}

/**
 * Evaluate whether a global promotion may proceed.
 *
 * Promote only when:
 * - independentHouseholdCount ≥ MIN_HOUSEHOLDS_FOR_PROMOTION
 * - curated === true
 * - disagreementRate ≤ MAX_DISAGREEMENT_RATE
 *
 * Majority alone → queue or reject, never promote.
 */
export function evaluatePromotion(
  input: PromotionEvaluationInput,
): PromotionDecision {
  const reasons: string[] = [];
  const needsHouseholds = Math.max(
    0,
    MIN_HOUSEHOLDS_FOR_PROMOTION - input.independentHouseholdCount,
  );
  const needsCuration = !input.curated;

  if (input.disagreementRate > MAX_DISAGREEMENT_RATE) {
    reasons.push(
      `disagreementRate ${input.disagreementRate} > ${MAX_DISAGREEMENT_RATE}`,
    );
    return { action: 'reject', reasons };
  }

  if (needsHouseholds > 0) {
    reasons.push(
      `need ${needsHouseholds} more independent household(s) (have ${input.independentHouseholdCount}, want ${MIN_HOUSEHOLDS_FOR_PROMOTION})`,
    );
  }
  if (needsCuration) {
    reasons.push('awaiting curation queue approval');
  }

  if (needsHouseholds === 0 && !needsCuration) {
    return {
      action: 'promote',
      reasons: [
        `≥${MIN_HOUSEHOLDS_FOR_PROMOTION} households`,
        'curation approved',
        `disagreementRate ${input.disagreementRate} ≤ ${MAX_DISAGREEMENT_RATE}`,
      ],
    };
  }

  if (
    input.independentHouseholdCount >= 1 ||
    input.disagreementRate <= MAX_DISAGREEMENT_RATE
  ) {
    return {
      action: 'queue',
      reasons: reasons.length > 0 ? reasons : ['pending promotion criteria'],
      needsHouseholds,
      needsCuration,
    };
  }

  return {
    action: 'reject',
    reasons: reasons.length > 0 ? reasons : ['insufficient evidence'],
  };
}
