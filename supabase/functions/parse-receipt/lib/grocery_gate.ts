/**
 * Grocery-likelihood pre-check decisions.
 * Pure: interprets model gate result; does not call the network.
 *
 * Reject Home Depot / hardware / pure pharmacy / random photos before
 * spending on the full parse (red-team M1, SPEC M2).
 */

import type { ModelGroceryGateResult } from './types.ts';

/** Minimum confidence to accept as grocery when isGroceryReceipt is true. */
export const GROCERY_ACCEPT_THRESHOLD = 0.55;
/** Below this, treat as non-grocery even if model flags true (ambiguous). */
export const GROCERY_HARD_REJECT_THRESHOLD = 0.35;

export interface GroceryGateDecision {
  readonly accept: boolean;
  readonly groceryConfidence: number;
  readonly reason: string;
  readonly storeHint: string | null;
}

export function decideGroceryGate(
  result: ModelGroceryGateResult,
): GroceryGateDecision {
  const conf = clamp01(result.groceryConfidence);
  if (!result.isGroceryReceipt) {
    return {
      accept: false,
      groceryConfidence: conf,
      reason: result.reason || 'model_classified_non_grocery',
      storeHint: result.storeHint,
    };
  }
  if (conf < GROCERY_HARD_REJECT_THRESHOLD) {
    return {
      accept: false,
      groceryConfidence: conf,
      reason: result.reason || 'grocery_confidence_too_low',
      storeHint: result.storeHint,
    };
  }
  if (conf < GROCERY_ACCEPT_THRESHOLD) {
    // Ambiguous: still reject to protect quota dollars; client can override later if product wants.
    return {
      accept: false,
      groceryConfidence: conf,
      reason: result.reason || 'grocery_confidence_below_accept',
      storeHint: result.storeHint,
    };
  }
  return {
    accept: true,
    groceryConfidence: conf,
    reason: result.reason || 'grocery_likely',
    storeHint: result.storeHint,
  };
}

/**
 * Secondary check from full parse result (if gate was skipped or for consistency).
 */
export function decideFromFullParse(args: {
  readonly isGroceryReceipt: boolean;
  readonly groceryConfidence: number;
  readonly foodLineCount: number;
  readonly nonFoodLineCount: number;
}): GroceryGateDecision {
  const conf = clamp01(args.groceryConfidence);
  if (!args.isGroceryReceipt) {
    return {
      accept: false,
      groceryConfidence: conf,
      reason: 'full_parse_non_grocery',
      storeHint: null,
    };
  }
  // If almost all lines are non-food (hardware SKUs), reject even if model said grocery.
  const total = args.foodLineCount + args.nonFoodLineCount;
  if (total >= 3 && args.foodLineCount === 0) {
    return {
      accept: false,
      groceryConfidence: Math.min(conf, 0.2),
      reason: 'no_food_lines_in_parse',
      storeHint: null,
    };
  }
  if (conf < GROCERY_ACCEPT_THRESHOLD) {
    return {
      accept: false,
      groceryConfidence: conf,
      reason: 'full_parse_low_grocery_confidence',
      storeHint: null,
    };
  }
  return {
    accept: true,
    groceryConfidence: conf,
    reason: 'grocery_likely',
    storeHint: null,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
