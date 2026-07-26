/**
 * Publish rate limits — client-side sliding window.
 * Server RLS still gates writes; this prevents accidental spam floods.
 */

export const PUBLISH_RATE_LIMIT = 5;
export const PUBLISH_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export type PublishRateLimitResult =
  | { readonly allowed: true; readonly remaining: number }
  | {
      readonly allowed: false;
      readonly remaining: 0;
      readonly retryAfterMs: number;
    };

/**
 * Pure sliding-window check for publish events.
 * `timestamps` are prior successful publish times (ms).
 */
export function checkPublishRateLimit(
  timestamps: readonly number[],
  nowMs: number,
  limit: number = PUBLISH_RATE_LIMIT,
  windowMs: number = PUBLISH_RATE_WINDOW_MS,
): PublishRateLimitResult {
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

export function recordPublish(
  timestamps: readonly number[],
  nowMs: number,
  windowMs: number = PUBLISH_RATE_WINDOW_MS,
): number[] {
  const cutoff = nowMs - windowMs;
  return [...timestamps.filter((t) => t > cutoff), nowMs];
}

/**
 * Mutable limiter for the live UI. Inject `now` in tests.
 */
export class PublishRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly limit: number = PUBLISH_RATE_LIMIT,
    private readonly windowMs: number = PUBLISH_RATE_WINDOW_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  peek(): PublishRateLimitResult {
    return checkPublishRateLimit(
      this.timestamps,
      this.now(),
      this.limit,
      this.windowMs,
    );
  }

  tryAcquire(): PublishRateLimitResult {
    const result = checkPublishRateLimit(
      this.timestamps,
      this.now(),
      this.limit,
      this.windowMs,
    );
    if (result.allowed) {
      this.timestamps = recordPublish(
        this.timestamps,
        this.now(),
        this.windowMs,
      );
    }
    return result;
  }

  seedTimestamps(times: readonly number[]): void {
    this.timestamps = [...times];
  }

  getTimestamps(): readonly number[] {
    return this.timestamps;
  }
}
