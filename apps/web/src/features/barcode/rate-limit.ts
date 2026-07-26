/**
 * Client-side sliding-window rate limiter for Open Food Facts product reads.
 * Respects 15 reads/min/IP — degrade politely rather than hammer the API.
 */

import { OFF_RATE_LIMIT_PER_MINUTE } from './attribution';

export type RateLimitResult =
  | { readonly allowed: true; readonly remaining: number }
  | {
      readonly allowed: false;
      readonly remaining: 0;
      readonly retryAfterMs: number;
    };

/**
 * Pure sliding-window throttle. Timestamps are milliseconds of prior requests.
 * Returns whether a new request may proceed and how many slots remain.
 */
export function checkRateLimit(
  timestamps: readonly number[],
  nowMs: number,
  limit: number = OFF_RATE_LIMIT_PER_MINUTE,
  windowMs = 60_000,
): RateLimitResult {
  const cutoff = nowMs - windowMs;
  const recent = timestamps.filter((t) => t > cutoff);
  if (recent.length >= limit) {
    const oldest = Math.min(...recent);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + windowMs - nowMs),
    };
  }
  return {
    allowed: true,
    remaining: limit - recent.length - 1,
  };
}

/** Append a successful-schedule timestamp; drops entries outside the window. */
export function recordRequest(
  timestamps: readonly number[],
  nowMs: number,
  windowMs = 60_000,
): number[] {
  const cutoff = nowMs - windowMs;
  return [...timestamps.filter((t) => t > cutoff), nowMs];
}

/**
 * Mutable limiter for the live client. Inject `now` in tests.
 */
export class OffRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly limit: number = OFF_RATE_LIMIT_PER_MINUTE,
    private readonly windowMs = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Peek without recording. */
  peek(): RateLimitResult {
    return checkRateLimit(this.timestamps, this.now(), this.limit, this.windowMs);
  }

  /**
   * Try to take a slot. On success, records the request time.
   * On failure, does not record.
   */
  tryAcquire(): RateLimitResult {
    const result = checkRateLimit(
      this.timestamps,
      this.now(),
      this.limit,
      this.windowMs,
    );
    if (result.allowed) {
      this.timestamps = recordRequest(
        this.timestamps,
        this.now(),
        this.windowMs,
      );
    }
    return result;
  }

  /** Test helper — inject prior request times. */
  seedTimestamps(times: readonly number[]): void {
    this.timestamps = [...times];
  }

  getTimestamps(): readonly number[] {
    return this.timestamps;
  }
}
