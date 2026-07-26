/**
 * Ephemeral handoff between Scan and Review routes (sessionStorage).
 */

import type { ReviewState } from './review-model';
import type { ParseSuccessResponse } from './types';

const PARSE_KEY = 'tgp.receipt.pending-parse';
const REVIEW_KEY = 'tgp.receipt.pending-review';
const RESULT_KEY = 'tgp.receipt.last-result';

export function stashParseResult(parse: ParseSuccessResponse): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(PARSE_KEY, JSON.stringify(parse));
}

export function takeParseResult(): ParseSuccessResponse | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(PARSE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PARSE_KEY);
  try {
    return JSON.parse(raw) as ParseSuccessResponse;
  } catch {
    return null;
  }
}

export function stashReviewState(state: ReviewState): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(REVIEW_KEY, JSON.stringify(state));
}

export function loadReviewState(): ReviewState | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(REVIEW_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReviewState;
  } catch {
    return null;
  }
}

export function clearReviewState(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(REVIEW_KEY);
}

export type LastCommitMessage = {
  message: string;
  tapCount: number;
  added: number;
  skipped: number;
};

export function stashCommitResult(result: LastCommitMessage): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
}

export function takeCommitResult(): LastCommitMessage | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(RESULT_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(RESULT_KEY);
  try {
    return JSON.parse(raw) as LastCommitMessage;
  } catch {
    return null;
  }
}
