/**
 * Cooking-mode product policy — pure constants for tests and UI.
 *
 * AdMob: no ads during focused tasks. Also basic decency.
 * AdSlot must never appear on the cooking route.
 */

export const COOKING_MODE_POLICY = {
  /** Both AdMob policy and product rule. */
  adsAllowed: false as const,
  /** Keep screen awake while in cooking mode (native plugin; no-op on web). */
  keepAwake: true as const,
  /** Minimum tap target for next/back (arm's-length counter use). */
  minTapTargetPx: 56 as const,
  /** Respect prefers-reduced-motion — keep transitions minimal. */
  reducedMotionRespect: true as const,
  /**
   * Exit must hand off to existing cook → deduct preview.
   * Do not reimplement planCook / commit here.
   */
  exitRouteTemplate: '/recipes/:id/cook' as const,
} as const;

export type CookingModePolicy = typeof COOKING_MODE_POLICY;

/** Runtime guard used by the screen (and tests). */
export function cookingModeAllowsAds(): boolean {
  return COOKING_MODE_POLICY.adsAllowed;
}
