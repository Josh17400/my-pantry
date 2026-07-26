/**
 * Cook de-dupe — same recipeId within a window → prior event for merge UX.
 *
 * Default window: 3 hours (SPEC). Merge is the default action.
 * Pure; never writes transactions.
 */

import type {
  CookCandidate,
  CookLogEvent,
  DuplicateCookHit,
  FindDuplicateCookOptions,
} from './types';

/** SPEC default: 3 hours. */
export const DEFAULT_COOK_WINDOW_MS = 3 * 60 * 60 * 1000;

function parseTime(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    throw new Error(`Invalid occurredAt: ${iso}`);
  }
  return t;
}

/**
 * Find the most recent household cook of the same recipe inside the window.
 *
 * @returns prior event + merge default, or null if none in window
 */
export function findDuplicateCook(
  householdLog: readonly CookLogEvent[],
  candidate: CookCandidate,
  options: FindDuplicateCookOptions = {},
): DuplicateCookHit | null {
  const windowMs = options.windowMs ?? DEFAULT_COOK_WINDOW_MS;
  const nowFn = options.now ?? (() => new Date());
  const candidateAt = candidate.occurredAt
    ? parseTime(candidate.occurredAt)
    : nowFn().getTime();

  let best: CookLogEvent | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const event of householdLog) {
    if (event.recipeId !== candidate.recipeId) continue;
    const eventAt = parseTime(event.occurredAt);
    const delta = Math.abs(candidateAt - eventAt);
    if (delta > windowMs) continue;
    // Prefer most recent prior (smallest positive age when event ≤ candidate;
    // otherwise smallest absolute delta). Tie-break: lexicographic cookEventId.
    if (
      best === null ||
      delta < bestDelta ||
      (delta === bestDelta && event.cookEventId < best.cookEventId)
    ) {
      best = event;
      bestDelta = delta;
    }
  }

  if (best === null) return null;

  return {
    prior: best,
    windowMs,
    deltaMs: bestDelta,
    defaultAction: 'merge',
  };
}
