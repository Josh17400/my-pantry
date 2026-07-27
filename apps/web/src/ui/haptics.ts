/**
 * Light selection tick for picker detents.
 * Uses @capacitor/haptics on native; silently no-ops on web / when unavailable.
 */

let reducedMotionCached: boolean | null = null;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (reducedMotionCached === null) {
    reducedMotionCached = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
  }
  return reducedMotionCached;
}

/** Fire a light haptic tick; never throws. */
export async function selectionTick(): Promise<void> {
  if (prefersReducedMotion()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Web browser, missing plugin, or non-native shell — ignore.
  }
}
