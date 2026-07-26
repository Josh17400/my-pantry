/**
 * Open Food Facts product lookup client.
 *
 * - Custom User-Agent (required by OFF)
 * - Client rate limit (15/min)
 * - Local cache (hits skip network + rate budget)
 * - Returns segregated OffDerivedProduct only
 */

import {
  OFF_API_PRODUCT_BASE,
  OFF_USER_AGENT,
} from './attribution';
import { BarcodeOffCache, isPlausibleBarcode, normalizeBarcode } from './cache';
import { OffRateLimiter } from './rate-limit';
import { mapOffApiToDerived } from './segregation';
import type { OffApiResponseJson, OffLookupResult } from './types';

export type OffFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export type OffClientOptions = {
  cache?: BarcodeOffCache;
  limiter?: OffRateLimiter;
  fetchImpl?: OffFetch;
  now?: () => number;
};

export class OffProductClient {
  private readonly cache: BarcodeOffCache;
  private readonly limiter: OffRateLimiter;
  private readonly fetchImpl: OffFetch;
  private readonly now: () => number;

  constructor(opts: OffClientOptions = {}) {
    this.cache = opts.cache ?? new BarcodeOffCache();
    this.limiter = opts.limiter ?? new OffRateLimiter();
    this.fetchImpl = opts.fetchImpl ?? defaultFetch;
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Resolve barcode → OFF product. Cache hits never hit network or rate limit.
   */
  async lookup(rawBarcode: string): Promise<OffLookupResult> {
    const barcode = normalizeBarcode(rawBarcode);
    if (!barcode || !isPlausibleBarcode(barcode)) {
      return {
        ok: false,
        reason: 'invalid-barcode',
        message: 'Enter a valid UPC/EAN (8, 12, or 13 digits).',
      };
    }

    const cached = this.cache.get(barcode);
    if (cached) {
      return { ok: true, product: cached, fromCache: true };
    }

    const slot = this.limiter.tryAcquire();
    if (!slot.allowed) {
      return {
        ok: false,
        reason: 'rate-limited',
        message:
          'Open Food Facts rate limit reached (15 lookups/min). Try again shortly.',
        retryAfterMs: slot.retryAfterMs,
      };
    }

    const url = `${OFF_API_PRODUCT_BASE}/${encodeURIComponent(barcode)}.json`;
    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': OFF_USER_AGENT,
        },
      });

      if (!res.ok) {
        return {
          ok: false,
          reason: 'network',
          message: `Open Food Facts returned HTTP ${res.status}.`,
        };
      }

      const json = (await res.json()) as OffApiResponseJson;
      if (json.status !== 1 || !json.product) {
        return {
          ok: false,
          reason: 'not-found',
          message: 'No product found for this barcode in Open Food Facts.',
        };
      }

      const product = mapOffApiToDerived(
        barcode,
        json.product,
        new Date(this.now()).toISOString(),
      );
      this.cache.set(product);
      return { ok: true, product, fromCache: false };
    } catch (err) {
      return {
        ok: false,
        reason: 'network',
        message:
          err instanceof Error
            ? err.message
            : 'Network error contacting Open Food Facts.',
      };
    }
  }
}

async function defaultFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  // Browser fetch may strip User-Agent; we still set it for native / node tests.
  return fetch(url, init);
}

/** Singleton for the UI. */
let sharedClient: OffProductClient | null = null;

export function getOffProductClient(): OffProductClient {
  if (!sharedClient) sharedClient = new OffProductClient();
  return sharedClient;
}

/** Test reset. */
export function resetOffProductClient(): void {
  sharedClient = null;
}
